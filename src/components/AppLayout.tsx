import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import FamilySwitcher from "./FamilySwitcher";
import CookTimers from "./CookTimers";
import { signOut } from "../lib/api/auth";
import { forgetPhotoUrls } from "../lib/api/photos";
import { getMyProfile } from "../lib/api/profile";
import { creditSignupSource, recordVisit } from "../lib/api/activity";
import { safeFrom } from "../lib/nextPath";
import { ADMIN_ORIGIN, KITCHEN_ORIGIN } from "../lib/hosts";
import { reasonLabel, type Profile } from "../lib/api/types";
import { useAuth } from "../context/AuthContext";

export default function AppLayout() {
  const navigate = useNavigate();
  const { userId } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  // THIS COMPONENT IS WHERE A VISIT IS RECORDED because it is the one thing every signed-in
  // route passes through: it renders inside RequireAuth and TermsGate, so there is no signed-in
  // page that can be opened without it. Putting the call on each page instead would be a list
  // nobody updates when a page is added.
  //
  // recordVisit deduplicates per day and surface in memory, so this firing on every navigation
  // is one write per feature per day, not one per click.
  useEffect(() => {
    recordVisit(location.pathname);
  }, [location.pathname]);

  // Crediting the marketing page that sent them. `from` rode here inside `next`, which is the
  // only value that survives a Google round trip and an email confirmation opened later; see
  // lib/nextPath.ts. The parameter is stripped afterwards so it does not linger in the address
  // bar and end up in a link somebody copies. The database refuses the write unless the column
  // is still empty and the account is under seven days old, so a stale or repeated parameter
  // credits nothing. Seven days, not minutes: this effect runs after the confirmation link is
  // opened, which can be days later. 0060's header has the reasoning.
  useEffect(() => {
    const from = safeFrom(params.get("from"));
    if (!from) return;
    creditSignupSource(from);
    const rest = new URLSearchParams(params);
    rest.delete("from");
    setParams(rest, { replace: true });
  }, [params, setParams]);
  // The link is the ONLY way to reach the console: it lives on admin.enamelvault.com (see
  // ADMIN_ORIGIN) and is linked from nowhere else, so without this a moderator would have to
  // remember another host to find their own queue.
  //
  // This is a CONVENIENCE, not a permission. Hiding a link protects nothing, and the real
  // guard is elsewhere and stays there: the page re-checks is_moderator, and the report rows
  // are unreadable to anyone else under RLS. Someone who types the URL without the flag still
  // gets nothing, which is the behaviour a test pins.
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let ignore = false;
    // A failure here must leave the link hidden rather than break the whole layout, which
    // wraps every signed-in page.
    getMyProfile()
      .then((p) => { if (!ignore) setProfile(p); })
      .catch(() => { if (!ignore) setProfile(null); });
    return () => { ignore = true; };
  }, [userId]);

  // LEAVE THE PAGE FIRST, then drop the session. The order is the fix, not a style: signing
  // out while still standing on a guarded route lets RequireAuth see a signed-out visitor
  // there, and it redirects to /signin?next=<that page>. The next person to sign in on the
  // same browser then lands on the previous person's page. The page re-checks and refuses
  // them, so nothing leaks, but a shared machine should not hand over a destination at all.
  //
  // Navigating while still signed in is harmless: /signin is public. The other order is not.
  async function handleSignOut() {
    navigate("/signin");
    await signOut();
    // Remembered photo urls outlive the session by up to a day otherwise, so the next person
    // to sign in on this browser would be served the last person's photos. This lived inside
    // signOut until 2026-10-11; it moved here so the auth module stays family-free, and
    // AppLayout.signout.test.tsx is what stops it being dropped.
    forgetPhotoUrls();
  }

  return (
    <div className="app">
      {/* First focusable thing on the page. Without it a keyboard or screen-reader user tabs
          through the whole nav on every single page before reaching the content. Visible only
          when focused, so it costs everyone else nothing. */}
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <Link to="/">Family Recipes</Link>
        {/* A visitor arrives here from a shared recipe link. Everything in the signed-in nav
            would bounce them to /signin, so the public header offers the one thing that
            works: signing in. */}
        {userId ? (
          <>
            <nav aria-label="Main">
              <NavLink to="/" end>
                Recipes
              </NavLink>
              <NavLink to="/kitchen">My Kitchen</NavLink>
              <NavLink to="/potluck">Potluck</NavLink>
              {/* Static on purpose, and NOT conditional on having published. The page lives
                  at /cooks/<handle>, so linking there directly would mean fetching the
                  profile here and holding a handle that goes stale the moment Settings
                  changes it. /me redirects instead. */}
              <NavLink to="/me">My Profile</NavLink>
              <NavLink to="/families">Families</NavLink>
              <NavLink to="/settings">Settings</NavLink>
              {/* The kitchen app, for everyone. It is a product of the same operator and is
                  already marketed on enamelvault.com, so it leaks nothing, and it is the hop
                  that makes the two products feel like one account. An <a>, not a NavLink:
                  another ORIGIN is a page load, and react-router would try to route it here. */}
              <a href={KITCHEN_ORIGIN}>For kitchens</a>
              {/* The console now lives on its own host, so this is a cross-origin link too.
                  Still a convenience and still not a permission: the console re-checks the
                  flag, and so does every call it makes. */}
              {profile?.is_moderator && <a href={ADMIN_ORIGIN}>Console</a>}
            </nav>
            <FamilySwitcher />
            <button type="button" onClick={handleSignOut}>
              Sign out
            </button>
          </>
        ) : (
          <nav aria-label="Main">
            <Link to="/signin" className="action">
              Sign in
            </Link>
          </nav>
        )}
      </header>
      <main className="app-main" id="main">
        {/* Shown on EVERY page while the state holds, and deliberately not dismissible: it
            describes a live state rather than an event, so a Dismiss button would let a cook
            hide something that is still true. It clears itself the moment they set a public
            name, which is also the moment their recipes return to Potluck (0035). Inside
            <main> on purpose: above it, the skip link would jump a screen-reader user straight
            past the one notice they most need. */}
        {profile?.name_cleared_at && !profile.public_name && (
          <p className="plate panel form-error">
            Your public name was removed by a moderator
            {profile.name_cleared_reason ? `: ${reasonLabel(profile.name_cleared_reason)}` : ""}.{" "}
            <strong>
              Your public recipes are hidden from Potluck until you set a new public name.
            </strong>{" "}
            <Link to="/settings">Set one in Settings</Link>, where you can also appeal.
          </p>
        )}
        <CookTimers />
        <Outlet />
      </main>
    </div>
  );
}
