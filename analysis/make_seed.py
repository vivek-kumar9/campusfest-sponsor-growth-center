import sys, json, pandas as pd, numpy as np
xl = pd.ExcelFile(sys.argv[1]); out = {}
def rows(sheet, cols):
    df = xl.parse(sheet)
    recs = []
    for _, r in df.iterrows():
        d = {}
        for src, dst in cols.items():
            v = r[src]
            if isinstance(v, pd.Timestamp): v = v.strftime('%Y-%m-%d %H:%M:%S')
            elif isinstance(v, (np.integer,)): v = int(v)
            elif isinstance(v, (np.floating,)): v = None if np.isnan(v) else float(v)
            elif isinstance(v, (np.bool_, bool)): v = bool(v)
            elif v is None or (isinstance(v, float) and np.isnan(v)): v = None
            elif pd.isna(v): v = None
            d[dst] = v
        recs.append(d)
    return recs
out['readme'] = rows('Read me', {'topic':'topic','description':'description'})
out['field_guide'] = rows('Field guide', {'source_table':'source_table','field':'field','data_type':'data_type','meaning':'meaning'})
out['event'] = rows('Event', {c:c for c in ['event_name','history_start','history_end','event_starts_at','event_ends_at','timezone','currency']})
out['targets'] = rows('Targets', {c:c for c in ['effective_at','qualified_brands_goal','confirmed_partnerships_goal','target_version']})
out['brands'] = rows('Brands', {c:c for c in ['brand_id','brand_name','industry','owner_id','owner_name','created_at']})
out['contacts'] = rows('Sponsor contacts', {c:c for c in ['contact_id','contact_name','job_title','brand_id','created_at']})
out['campaigns'] = rows('Sponsor campaigns', {'sponsor_campaign_id':'campaign_id','campaign_name':'campaign_name','channel':'channel','objective':'objective','audience':'audience','owner_id':'owner_id','owner_name':'owner_name','planned_start_at':'planned_start_at','planned_end_at':'planned_end_at','created_at':'created_at'})
out['interactions'] = rows('Sponsor interactions', {'interaction_id':'interaction_id','attempt_id':'attempt_id','origin_interaction_id':'origin_interaction_id','brand_id':'brand_id','contact_id':'contact_id','sponsor_campaign_id':'campaign_id','owner_id':'owner_id','channel':'channel','event_type':'event_type','outcome':'outcome','summary':'summary','occurred_at':'occurred_at'})
out['qualification'] = rows('Brand qualification', {'history_id':'history_id','brand_id':'brand_id','sponsor_campaign_id':'campaign_id','qualification_status':'qualification_status','reason':'reason','effective_at':'effective_at'})
out['opportunities'] = rows('Partner opportunities', {'opportunity_id':'opportunity_id','opportunity_name':'opportunity_name','brand_id':'brand_id','primary_contact_id':'primary_contact_id','sponsor_campaign_id':'campaign_id','support_type':'support_type','created_at':'created_at'})
out['opportunity_history'] = rows('Opportunity history', {'history_id':'history_id','opportunity_id':'opportunity_id','brand_id':'brand_id','stage':'stage','proposed_value_inr':'proposed_value_inr','confirmed_value_inr':'confirmed_value_inr','owner_id':'owner_id','owner_name':'owner_name','effective_at':'effective_at'})
out['activations'] = rows('Sponsor activations', {'activation_id':'activation_id','brand_id':'brand_id','opportunity_id':'opportunity_id','attendee_campaign_id':'attendee_campaign_id','attendee_campaign_name':'attendee_campaign_name','activation_note':'activation_note','linked_at':'linked_at'})
# team from all owner fields
team = {}
for t in ['brands','campaigns','opportunity_history']:
    for r in out[t]: team[r['owner_id']] = r['owner_name']
out['team'] = [{'owner_id':k,'owner_name':v} for k,v in sorted(team.items())]
json.dump(out, open('/home/claude/app/data/seed.json','w'), separators=(',',':'))
print({k: len(v) for k,v in out.items()}); print(out['team'])
# interactions owner ids
print(sorted(set(r['owner_id'] for r in out['interactions'])))
