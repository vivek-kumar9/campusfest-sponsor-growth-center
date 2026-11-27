// All timestamps are stored as `timestamp without time zone` holding Asia/Kolkata wall-clock time,
// matching the source pack (+05:30). A selected as-of date D means "end of D in IST", i.e. cut = D + 1 day (exclusive).
export const SCHEMA_SQL = `
create table if not exists meta (key text primary key, value text);
create table if not exists event (id int primary key default 1, event_name text, history_start date, history_end date,
  event_starts_at timestamp, event_ends_at timestamp, timezone text, currency text);
create table if not exists team (owner_id text primary key, owner_name text not null, role text);
create table if not exists targets (target_id serial primary key, effective_at timestamp not null, qualified_brands_goal int,
  confirmed_partnerships_goal int, cash_goal_inr int, target_version text, source text not null default 'dataset');
create table if not exists brands (brand_id text primary key, brand_name text not null, industry text, owner_id text, owner_name text,
  created_at timestamp not null, source text not null default 'dataset');
create table if not exists contacts (contact_id text primary key, contact_name text, job_title text, brand_id text, created_at timestamp,
  source text not null default 'dataset');
create table if not exists campaigns (campaign_id text primary key, campaign_name text not null, channel text, channel_group text,
  objective text, audience text, owner_id text, owner_name text, planned_start_at timestamp, planned_end_at timestamp, created_at timestamp,
  status text not null default 'active', budget_inr int, spent_inr int, notes text, source text not null default 'dataset');
create table if not exists interactions (interaction_id text primary key, attempt_id text, origin_interaction_id text, brand_id text,
  contact_id text, campaign_id text, owner_id text, channel text, event_type text not null, outcome text, summary text,
  occurred_at timestamp not null, source text not null default 'dataset');
create table if not exists qualification_history (history_id text primary key, brand_id text not null, campaign_id text,
  qualification_status text not null, reason text, effective_at timestamp not null, source text not null default 'dataset');
create table if not exists opportunities (opportunity_id text primary key, opportunity_name text not null, brand_id text not null,
  primary_contact_id text, campaign_id text, support_type text, deal_type text not null default 'new', created_at timestamp not null,
  source text not null default 'dataset');
create table if not exists opportunity_history (history_id text primary key, opportunity_id text not null, brand_id text, stage text not null,
  proposed_value_inr int, confirmed_value_inr int, owner_id text, owner_name text, effective_at timestamp not null, note text,
  source text not null default 'dataset');
create table if not exists activations (activation_id text primary key, brand_id text, opportunity_id text, attendee_campaign_id text,
  attendee_campaign_name text, activation_note text, linked_at timestamp);
create table if not exists payments (payment_id text primary key, opportunity_id text not null, amount_inr int not null,
  status text not null default 'received', invoiced_at timestamp, received_at timestamp, note text, created_at timestamp not null);
create table if not exists initiatives (initiative_id text primary key, rank int, name text not null, concept text, owner_id text,
  status text not null default 'active', decision text, budget_inr int, spent_inr int default 0, start_week int, end_week int,
  expected_incremental_inr int, confidence float8, effort_weeks float8, kpi_key text, kpi_label text, scale_threshold float8,
  stop_threshold float8, threshold_note text, linked_campaign_ids text, updated_at timestamp);
create table if not exists tasks (task_id text primary key, title text not null, description text, owner_id text, due_date date,
  status text not null default 'todo', priority text not null default 'medium', related_type text, related_id text, initiative_id text,
  created_by text not null default 'user', source text not null default 'app', created_at timestamp not null, updated_at timestamp);
create table if not exists assumptions (key text primary key, label text not null, value float8 not null, unit text, source_tag text not null,
  note text, sort int);
create table if not exists pending_actions (action_id text primary key, action_type text not null, payload jsonb not null, summary text,
  status text not null default 'pending', created_at timestamp not null, resolved_at timestamp, result text);
create table if not exists audit_log (id serial primary key, at timestamp not null, actor text, action text, entity_type text, entity_id text, detail text);
create table if not exists import_log (table_name text primary key, source_rows int, loaded_rows int, duplicates_skipped int, conflicting_duplicates int);

create index if not exists ix_int_brand on interactions(brand_id);
create index if not exists ix_int_time on interactions(occurred_at);
create index if not exists ix_oh_opp on opportunity_history(opportunity_id, effective_at);
create index if not exists ix_qh_brand on qualification_history(brand_id, effective_at);

create or replace function cut_of(d date) returns timestamp language sql immutable as $$ select (d + 1)::timestamp $$;

-- latest full-state opportunity version strictly before the cut-off
create or replace function opp_state_asof(cut timestamp)
returns table(opportunity_id text, stage text, proposed_value_inr int, confirmed_value_inr int, owner_id text, owner_name text,
  stage_effective_at timestamp, history_id text)
language sql stable as $$
  select distinct on (h.opportunity_id) h.opportunity_id, h.stage, h.proposed_value_inr, h.confirmed_value_inr, h.owner_id, h.owner_name,
    h.effective_at, h.history_id
  from opportunity_history h where h.effective_at < cut
  order by h.opportunity_id, h.effective_at desc, h.history_id desc
$$;

-- latest full-state qualification version per brand strictly before the cut-off
create or replace function brand_qual_asof(cut timestamp)
returns table(brand_id text, qualification_status text, reason text, campaign_id text, qual_effective_at timestamp)
language sql stable as $$
  select distinct on (h.brand_id) h.brand_id, h.qualification_status, h.reason, h.campaign_id, h.effective_at
  from qualification_history h where h.effective_at < cut
  order by h.brand_id, h.effective_at desc, h.history_id desc
$$;

create or replace function target_asof(cut timestamp)
returns table(target_version text, effective_at timestamp, qualified_brands_goal int, confirmed_partnerships_goal int, cash_goal_inr int, source text)
language sql stable as $$
  select t.target_version, t.effective_at, t.qualified_brands_goal, t.confirmed_partnerships_goal, t.cash_goal_inr, t.source
  from targets t where t.effective_at < cut order by t.effective_at desc, t.target_id desc limit 1
$$;

-- readable views (deduplicated by primary keys at import)
create or replace view v_opportunities as
  select o.opportunity_id, o.opportunity_name, o.brand_id, b.brand_name, b.industry, o.campaign_id, c.campaign_name, c.channel_group,
    o.support_type, o.deal_type, o.created_at, o.primary_contact_id
  from opportunities o left join brands b on b.brand_id = o.brand_id left join campaigns c on c.campaign_id = o.campaign_id;
create or replace view v_interactions as
  select i.*, b.brand_name, b.industry, c.campaign_name, c.channel_group, ct.contact_name, ct.job_title, t.owner_name
  from interactions i left join brands b on b.brand_id = i.brand_id left join campaigns c on c.campaign_id = i.campaign_id
  left join contacts ct on ct.contact_id = i.contact_id left join team t on t.owner_id = i.owner_id;
`;
