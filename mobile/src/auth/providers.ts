import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { supabase } from "../supabase";

export type SignInResult = { error: string | null };

const message = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong signing in.";

/**
 * SIGN-IN ONLY. There is no sign-up here, no password reset and no account creation: the
 * phone app is a second way into an account that already exists, and the web app is where
 * one is made. A failed password therefore says so plainly rather than offering to register.
 */
export async function signInWithEmail(email: string, password: string): Promise<SignInResult> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  return { error: error ? error.message : null };
}

/**
 * The redirect the app is reachable at. It must be in the hosted project's allow list, which
 * FAILS SILENTLY when it is wrong: Supabase substitutes the Site URL and the browser lands
 * on the website instead of coming back to the app, with no error anywhere.
 * `docs/OPERATIONS.md` records the globstar entry the web callback needed for the same
 * reason.
 */
export const redirectTo = AuthSession.makeRedirectUri({ scheme: "familyrecipes", path: "auth/callback" });

/**
 * Google goes through the system browser rather than a native SDK, which keeps the app free
 * of a Google SDK (the design forbids third-party SDKs, and `src/pages/Cookies.tsx` says in
 * public that nothing third-party is contacted) and means there is no iOS client id to
 * configure and keep in step.
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return { error: error.message };
    if (!data.url) return { error: "Google sign-in is not configured for this project." };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    // Cancelling is not an error: the cook pressed Done.
    if (result.type !== "success") return { error: null };

    const code = new URL(result.url).searchParams.get("code");
    if (!code) return { error: "Google sent us back without a sign-in code." };
    const exchanged = await supabase.auth.exchangeCodeForSession(code);
    return { error: exchanged.error ? exchanged.error.message : null };
  } catch (error) {
    return { error: message(error) };
  }
}

/** Whether to draw the Apple button at all. It is iOS-only and absent on older devices. */
export async function appleSignInAvailable(): Promise<boolean> {
  return Platform.OS === "ios" && (await AppleAuthentication.isAvailableAsync());
}

export async function signInWithApple(): Promise<SignInResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    // Apple hands back the name and email ONCE, on the very first authorisation, and never
    // again. Nothing here depends on them: the profile already exists, because this app
    // cannot create an account.
    if (!credential.identityToken) return { error: "Apple did not return a sign-in token." };

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    return { error: error ? error.message : null };
  } catch (error) {
    // The cook dismissing the Apple sheet arrives here as ERR_REQUEST_CANCELED, which is not
    // a failure and must not be shown as one.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ERR_REQUEST_CANCELED") {
      return { error: null };
    }
    return { error: message(error) };
  }
}
