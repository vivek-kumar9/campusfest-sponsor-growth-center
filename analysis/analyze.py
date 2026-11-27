import sys, pandas as pd, numpy as np, json
pd.set_option('display.width', 250); pd.set_option('display.max_columns', 60); pd.set_option('display.max_rows', 300); pd.set_option('display.max_colwidth', 80)
xl = pd.ExcelFile(sys.argv[1])
S = {sh: xl.parse(sh) for sh in xl.sheet_names}
si = S['Sponsor interactions'].drop_duplicates()
assert si.interaction_id.is_unique
bq = S['Brand qualification'].drop_duplicates(); assert bq.history_id.is_unique
oh = S['Opportunity history'].drop_duplicates(); assert oh.history_id.is_unique
po = S['Partner opportunities']; br = S['Brands']; ct = S['Sponsor contacts']; sc = S['Sponsor campaigns']
print('rows after dedupe: interactions', len(si), 'qual', len(bq), 'opphist', len(oh))
# --- structure of attempts
roots = si[si.origin_interaction_id.isna()]
print('root event types:\n', roots.event_type.value_counts())
print('non-root w/o valid origin:', (~si[si.origin_interaction_id.notna()].origin_interaction_id.isin(si.interaction_id)).sum())
# attempts: does attempt_id map 1:1 to root?
print('attempts', si.attempt_id.nunique(), 'roots', len(roots), 'roots per attempt max', roots.groupby('attempt_id').size().max())
# dates
print('interaction date range', si.occurred_at.min(), si.occurred_at.max())
print('events after event end (2025-04-13 20:00):', (si.occurred_at > '2025-04-13 20:00').sum())
print('qual range', bq.effective_at.min(), bq.effective_at.max(), ' opphist range', oh.effective_at.min(), oh.effective_at.max())
print('brands created range', br.created_at.min(), br.created_at.max(), 'contacts per brand', ct.groupby('brand_id').size().value_counts().to_dict())
# --- per campaign interaction funnel (attempt-level)
def camp_funnel(df):
    g = df.groupby('campaign_name')
    out = pd.DataFrame({
      'root_touches': g.apply(lambda x: (x.origin_interaction_id.isna()).sum()),
      'outreach_sent': g.apply(lambda x: (x.event_type=='outreach_sent').sum()),
      'intro_recv': g.apply(lambda x: (x.event_type=='introduction_received').sum()),
      'web_inbound': g.apply(lambda x: (x.event_type=='web_inbound').sum()),
      'delivered': g.apply(lambda x: (x.event_type=='delivered').sum()),
      'replied': g.apply(lambda x: (x.event_type=='replied').sum()),
      'positive': g.apply(lambda x: (x.outcome=='positive').sum()),
      'neutral': g.apply(lambda x: (x.outcome=='neutral').sum()),
      'not_int': g.apply(lambda x: (x.outcome=='not_interested').sum()),
      'mtg_booked': g.apply(lambda x: (x.event_type=='meeting_booked').sum()),
      'mtg_held': g.apply(lambda x: (x.event_type=='meeting_held').sum()),
      'opt_out': g.apply(lambda x: (x.event_type=='opt_out').sum()),
      'brands_touched': g.brand_id.nunique(),
      'contacts_touched': g.contact_id.nunique(),
    })
    return out
cf = camp_funnel(si); print(cf.to_string())
# which root type precedes replies
rr = si[si.event_type=='replied'].merge(si[['interaction_id','event_type']].rename(columns={'interaction_id':'origin_interaction_id','event_type':'root_type'}), on='origin_interaction_id', how='left')
print('replies by root type:\n', pd.crosstab(rr.root_type, rr.outcome))
# brand-level outcome per campaign: brands with positive reply, brands with meeting held
def brands_with(cond): return si[cond].groupby('campaign_name').brand_id.nunique()
bf = pd.DataFrame({'brands_touched': si.groupby('campaign_name').brand_id.nunique(),
  'brands_replied': brands_with(si.event_type=='replied'),
  'brands_positive': brands_with(si.outcome=='positive'),
  'brands_mtg_held': brands_with(si.event_type=='meeting_held')}).fillna(0).astype(int)
print(bf.to_string()); print('TOTAL distinct brands touched', si.brand_id.nunique(), 'replied', si[si.event_type=="replied"].brand_id.nunique(), 'positive', si[si.outcome=="positive"].brand_id.nunique(), 'mtg held', si[si.event_type=="meeting_held"].brand_id.nunique())
# --- as-of helpers
def cutoff(d): return pd.Timestamp(d) + pd.Timedelta(days=1)
def qual_asof(d):
    x = bq[bq.effective_at < cutoff(d)].sort_values(['effective_at','history_id']).groupby('brand_id').tail(1); return x
def opp_asof(d):
    x = oh[oh.effective_at < cutoff(d)].sort_values(['effective_at','history_id']).groupby('opportunity_id').tail(1); return x
def tgt_asof(d):
    t = S['Targets']; t = t[t.effective_at < cutoff(d)].sort_values('effective_at'); return t.tail(1)
for d in ['2025-02-15','2025-03-14','2025-03-15','2025-03-31','2025-04-11','2025-04-13','2025-04-20']:
    q = qual_asof(d); o = opp_asof(d); t = tgt_asof(d)
    conf = o[o.stage=='partner_confirmed']
    print(f"AS OF {d}: target={t.target_version.values} qual_goal={t.qualified_brands_goal.values} conf_goal={t.confirmed_partnerships_goal.values} | qualified={int((q.qualification_status=='qualified').sum())} status={q.qualification_status.value_counts().to_dict()} | opps={len(o)} stages={o.stage.value_counts().to_dict()} confirmed={len(conf)} conf_value={int(conf.confirmed_value_inr.sum())}")
# --- final snapshot detail
o = opp_asof('2025-04-20').merge(po[['opportunity_id','support_type','originating_campaign_name','created_at','primary_contact_id']], on='opportunity_id')
print(o[['opportunity_name','stage','proposed_value_inr','confirmed_value_inr','owner_name','support_type','originating_campaign_name','effective_at']].sort_values('stage').to_string())
conf = o[o.stage=='partner_confirmed']
print('confirmed by support type:', conf.groupby('support_type').confirmed_value_inr.agg(['count','sum']).to_dict())
print('confirmed by campaign:\n', conf.groupby('originating_campaign_name').confirmed_value_inr.agg(['count','sum','mean']))
print('opps by campaign & stage:\n', pd.crosstab(o.originating_campaign_name, o.stage, margins=True))
print('opps by owner & stage:\n', pd.crosstab(o.owner_name, o.stage, margins=True))
print('open pipeline value (proposal/negot/contacted/prospecting):', o[o.stage.isin(['prospecting','contacted','proposal_sent','negotiating'])].groupby('stage').proposed_value_inr.agg(['count','sum']))
# confirmed timing
fc = oh[oh.stage=='partner_confirmed'].groupby('opportunity_id').effective_at.min()
print('first confirmed dates:\n', fc.sort_values().to_string())
# stage reach & win rate by furthest stage
order = ['prospecting','contacted','proposal_sent','negotiating','partner_confirmed']
reach = {s: set(oh[oh.stage==s].opportunity_id) for s in order+['lost','withdrawn']}
final_conf = set(conf.opportunity_id)
for s in order: 
    n=len(reach[s]); w=len(reach[s]&final_conf); print(f"reached {s}: {n}, finally confirmed {w} ({w/n:.0%})")
# confirmed then changed?
for oid in reach['partner_confirmed']:
    seq = oh[oh.opportunity_id==oid].sort_values('effective_at').stage.tolist()
    if seq[-1] != 'partner_confirmed': print('confirmed then changed', oid, seq)
# stage skips / sequences
seqs = oh.sort_values('effective_at').groupby('opportunity_id').stage.apply(lambda s: '>'.join(s))
print(seqs.value_counts().to_string())
# cycle times
created = po.set_index('opportunity_id').created_at
first_stage = {s: oh[oh.stage==s].groupby('opportunity_id').effective_at.min() for s in order}
ct_days = ((first_stage['partner_confirmed'] - created.reindex(first_stage['partner_confirmed'].index)).dt.total_seconds()/86400)
print('days created->confirmed: median', ct_days.median(), 'mean', round(ct_days.mean(),1), 'min', ct_days.min(), 'max', ct_days.max())
ps = first_stage['proposal_sent']; pc = first_stage['partner_confirmed']; idx = ps.index.intersection(pc.index)
print('days proposal->confirmed median', ((pc[idx]-ps[idx]).dt.total_seconds()/86400).median())
# value changes in history
vc = oh.groupby('opportunity_id').proposed_value_inr.nunique(); print('opps with value changes', (vc>1).sum())
print(oh[oh.opportunity_id.isin(vc[vc>1].index)].sort_values(['opportunity_id','effective_at'])[['opportunity_name','stage','proposed_value_inr','confirmed_value_inr','effective_at']].to_string())
# owner mismatch brand owner vs opp owner
print('brand owners', br.owner_name.value_counts().to_dict(), ' opp owners (latest)', o.owner_name.value_counts().to_dict())
# qualification by source campaign final
q = qual_asof('2025-04-20'); print('final qual by source campaign:\n', pd.crosstab(q.source_campaign_name, q.qualification_status, margins=True))
# qualified but no opportunity, opportunity but not qualified
qual_brands = set(q[q.qualification_status=='qualified'].brand_id); opp_brands=set(o.brand_id)
print('qualified brands', len(qual_brands), 'with opp', len(qual_brands&opp_brands), 'opp brands not qualified', len(opp_brands-qual_brands))
print('industry of confirmed:', conf.merge(br[['brand_id','industry']], on='brand_id').industry.value_counts().to_dict())
print('industry of all brands:', br.industry.value_counts().to_dict())
# activations
print(S['Sponsor activations'][['brand_name','opportunity_name','attendee_campaign_name','linked_at']])
# brands with multiple opps
print('brands with >1 opp', po.groupby('brand_id').size().loc[lambda s: s>1])
# interactions per brand for confirmed vs lost
tb = si.groupby('brand_id').size()
print('touches per brand: confirmed', tb.reindex(list(set(conf.brand_id))).describe().round(1).to_dict())
# weekly confirmations
print('weekly first-confirmed:', fc.dt.to_period('W').value_counts().sort_index().to_dict())
# web inbound / intro flows
print(si[si.attempt_id.isin(si[si.event_type=='web_inbound'].attempt_id)].sort_values(['attempt_id','occurred_at'])[['attempt_id','event_type','outcome','occurred_at']].head(20).to_string())
