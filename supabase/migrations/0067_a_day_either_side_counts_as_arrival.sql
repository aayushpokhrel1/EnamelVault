-- 0067: the read side of a group's attendance tolerates the same skew the write side does.
--
-- THE DEFECT THIS FIXES, which was live: `kitchen.activity_days.day` is the CLIENT'S local
-- date, and both the check constraint and `record_kitchen_visit` (0064) accept
-- `current_date - 1 .. current_date + 1` on purpose, because "a day either side covers every
-- real timezone offset". 0065's numerator did not: it counted `ad.day > current_date - of_days`
-- with a floor of 1 on `of_days`, so for somebody who joined today the window was "strictly
-- after yesterday" and a row stamped with the client's local yesterday was dropped. Anybody
-- west of UTC in the evening therefore arrived and was reported to their owner as never having
-- come at all, on the first day of the job. Wider windows hid it, because seven days already
-- reach past one day of skew.
--
-- THE WINDOW IS WIDENED ON THE PAST EDGE ONLY, and the asymmetry is not an oversight: there
-- was never an upper bound, so a row stamped with the client's local tomorrow already counted.
-- Subtracting one more day is what makes the two edges agree with the writer.
--
-- THE COUNT IS CLAMPED TO `of_days`, which the old numerator did not need and this one does.
-- The pair is rendered as a fraction ("back 1 of 1 days"), so a window a day wider than its
-- own denominator could otherwise report 2 of 1, which is not a figure. Clamping keeps the
-- skewed row counted and the fraction readable.
--
-- `of_days` now appears ONCE, in a lateral of its own, rather than three times. The gate, the
-- staff join, the all-time `last_seen` and the `never` flag are unchanged, and 0065's header
-- holds the reasoning for every one of them.
create or replace function kitchen.group_people(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = kitchen, public as $$
declare
  v_staff jsonb;
  v_invites jsonb;
begin
  if kitchen.staff_role(p_org) = 'owner' then

    select coalesce(jsonb_agg(jsonb_build_object(
             'user_id', st.user_id,
             'display_name', st.display_name,
             'role', st.role,
             -- Null for group-wide staff, which is the normal case for an owner or a chef.
             'site_name', s.name,
             -- A day, not a visit: somebody who opened four pages this morning was here once.
             -- count(distinct day) is what makes that true, and the page says "days" for the
             -- same reason.
             'days_back', least(d.of_days, (
                 select count(distinct ad.day)
                   from kitchen.activity_days ad
                  where ad.org_id = p_org
                    and ad.user_id = st.user_id
                    and ad.day > current_date - d.of_days - 1)),
             'of_days', d.of_days,
             -- The LAST day they were here, over all time rather than inside the window: "last
             -- seen" has to mean last seen, or a figure of 0 of 7 would come with no date at
             -- all for somebody who was here a fortnight ago.
             'last_seen', (select max(ad.day) from kitchen.activity_days ad
                            where ad.org_id = p_org and ad.user_id = st.user_id),
             -- NEVER OPENED IT IS THE ABSENCE OF ANY ROW, EVER, and it is a state of its own
             -- rather than days_back = 0. Somebody who joined yesterday and has not arrived is
             -- not the same as somebody who stopped coming, and an owner acting on the two
             -- would do different things.
             'never', not exists (select 1 from kitchen.activity_days ad
                                   where ad.org_id = p_org and ad.user_id = st.user_id))
           order by st.display_name), '[]'::jsonb)
      into v_staff
      from kitchen.staff st
      left join kitchen.sites s on s.id = st.site_id
      -- THE DENOMINATOR IS DAYS SINCE JOINING, CAPPED AT SEVEN. Aayush's decision, and the
      -- reason is that "back 1 of 7 days" reads as four days of absence for somebody who
      -- started on Friday. The floor of 1 is what keeps somebody who joined today from being
      -- reported as 0 of 0, which is not a figure.
      left join lateral (
        select least(7, greatest(1, current_date - st.joined_at::date)) as of_days
      ) d on true
     where st.org_id = p_org;

    -- An invite carries its own expires_at (0054), so an aged-out invite is one that was never
    -- used and whose lifetime has run out. Counting from created_at would be a second opinion
    -- about the lifetime, and the column is the first.
    select jsonb_build_object(
             'issued', count(*),
             'used', count(*) filter (where used_at is not null),
             'open', count(*) filter (where used_at is null and expires_at > now()),
             'aged_out', count(*) filter (where used_at is null and expires_at <= now()))
      into v_invites
      from kitchen.staff_invites i
     where i.org_id = p_org;

    return jsonb_build_object(
      'staff', v_staff,
      'invites', v_invites,
      -- Closing and retiring are owner-only acts (0061), so their counts belong here rather
      -- than beside the throughput figures a chef also reads.
      'closed_sites', (select count(*) from kitchen.sites
                        where org_id = p_org and closed_at is not null),
      'retired_dishes', (select count(*) from kitchen.dishes
                          where org_id = p_org and retired_at is not null));
  end if;

  -- Not the owner. A chef, a site_manager, a cook, a former member and a stranger all get this.
  return '{}'::jsonb;
end; $$;

-- The trailer every migration in this schema has ended with since 0049, copied whole rather
-- than narrowed. Revoking without the re-grant takes execute away from `authenticated` too,
-- which 0063 proved with a 42501.
revoke execute on all functions in schema kitchen from public, anon;
grant execute on all functions in schema kitchen to authenticated, service_role;
grant execute on function kitchen.peek_invite(text) to anon;
