import sys, json, pandas as pd, numpy as np
xl = pd.ExcelFile(sys.argv[1])
oh = xl.parse('Opportunity history').drop_duplicates(); po = xl.parse('Partner opportunities')
ev = pd.Timestamp('2025-04-12 10:00')
last = oh.sort_values(['effective_at','history_id']).groupby('opportunity_id').tail(1)
conf = last[last.stage=='partner_confirmed'].merge(po[['opportunity_id','support_type','originating_campaign_name']], on='opportunity_id')
conf['days_before'] = (ev - conf.opportunity_id.map(oh[oh.stage=='partner_confirmed'].groupby('opportunity_id').effective_at.min())).dt.total_seconds()/86400
cash = conf[conf.support_type=='cash']
CDF = [(0,0.0),(15,0.25),(30,0.50),(45,0.75),(60,0.90),(90,1.0)]
cdf = lambda d: float(np.interp(d,[p[0] for p in CDF],[p[1] for p in CDF]))
def p_std(d): return cdf(d)
def p_adv(d):
    adv = 0.5*(0.9 if d>=7 else 0.0)
    bal = cdf(d) if d < 21 else min(1.0, cdf(d) + 0.5*(1-cdf(d)))
    return adv + 0.5*bal
def rate(df, fn, shift=0):
    v = df.confirmed_value_inr; return float((v*df.days_before.add(shift).apply(fn)).sum()/v.sum())
warm = cash[cash.originating_campaign_name.isin(['Creator Network Referrals','Warm Partner Introductions'])]
inb = cash[cash.originating_campaign_name=='Partner Interest Form']
R = dict(
  warm_std=rate(warm,p_std), inb_std=rate(inb,p_std), all_std=rate(cash,p_std),
  warm_adv_shift=rate(warm,p_adv,21), inb_adv_shift=rate(inb,p_adv,21), all_adv=rate(cash,p_adv), all_adv_shift=rate(cash,p_adv,21),
  renew_std=p_std(50), renew_adv=p_adv(70), cold_adv=p_adv(25))
print({k: round(v,3) for k,v in R.items()})
# 2026 model
seg = {
 'Renewals (2025 cash partners)': dict(pool=20, base=dict(n=20, conv=0.40, deal=100000, coll=R['renew_std']), stretch=dict(n=20, conv=0.65, deal=110000, coll=R['renew_adv'])),
 'Warm intros (alumni, partners, creators)': dict(pool=None, base=dict(n=30, conv=14/30, deal=97500, coll=R['warm_std']), stretch=dict(n=60, conv=0.40, deal=97500, coll=R['warm_adv_shift'])),
 'Inbound partner form': dict(pool=None, base=dict(n=18, conv=6/18, deal=635000/6, coll=R['inb_std']), stretch=dict(n=30, conv=6/18, deal=635000/6, coll=R['inb_adv_shift'])),
 'Cold outbound (qualified first)': dict(pool=None, base=dict(n=30, conv=0.0, deal=55000, coll=R['cold_adv']), stretch=dict(n=30, conv=0.10, deal=55000, coll=R['cold_adv'])),
}
out = {'rates': R, 'segments': []}
tot = {'base':{'deals':0,'signed':0,'collected':0}, 'stretch':{'deals':0,'signed':0,'collected':0}}
for name, s in seg.items():
    row = {'segment': name}
    for sc in ['base','stretch']:
        p = s[sc]; deals = p['n']*p['conv']; signed = deals*p['deal']; coll = signed*p['coll']
        row[sc] = dict(prospects=p['n'], conv=round(p['conv'],3), deals=round(deals,1), avg_deal=round(p['deal']), signed=round(signed), coll_rate=round(p['coll'],3), collected=round(coll))
        tot[sc]['deals']+=deals; tot[sc]['signed']+=signed; tot[sc]['collected']+=coll
    out['segments'].append(row)
out['totals'] = {k:{kk: round(vv,1) for kk,vv in v.items()} for k,v in tot.items()}
for r in out['segments']:
    print(f"{r['segment'][:38]:38s} BASE n={r['base']['prospects']:>3} conv={r['base']['conv']:.0%} deals={r['base']['deals']:>5} avg={r['base']['avg_deal']:>7} signed={r['base']['signed']:>8} coll={r['base']['coll_rate']:.0%} -> {r['base']['collected']:>8} | STRETCH n={r['stretch']['prospects']:>3} conv={r['stretch']['conv']:.0%} deals={r['stretch']['deals']:>5} avg={r['stretch']['avg_deal']:>7} signed={r['stretch']['signed']:>8} coll={r['stretch']['coll_rate']:.0%} -> {r['stretch']['collected']:>8}")
print(out['totals'])
# bet attribution: apply levers sequentially from base -> stretch in rank order
def total(cfg):
    t=0
    for name,s in seg.items():
        p=cfg[name]; t+= p['n']*p['conv']*p['deal']*p['coll']
    return t
import copy
cfg = {n: copy.deepcopy(s['base']) for n,s in seg.items()}
steps = []
b0 = total(cfg)
# 1 payment terms + earlier calendar: collection rates to stretch values for all segments
for n,s in seg.items(): cfg[n]['coll'] = s['stretch']['coll']
b1 = total(cfg); steps.append(('Advance-payment terms + 3-week earlier close calendar', b1-b0))
# 2 renewals
n='Renewals (2025 cash partners)'; cfg[n]['conv']=seg[n]['stretch']['conv']; cfg[n]['deal']=seg[n]['stretch']['deal']; b2=total(cfg); steps.append(('Renewal-first program with ROI proof pack', b2-b1))
# 3 warm intros
n='Warm intros (alumni, partners, creators)'; cfg[n]['n']=60; cfg[n]['conv']=0.40; b3=total(cfg); steps.append(('Warm-intro engine (alumni + partner referrals)', b3-b2))
# 4 inbound
n='Inbound partner form'; cfg[n]['n']=30; b4=total(cfg); steps.append(('Inbound engine (sponsor page + LinkedIn)', b4-b3))
# 5 cold
n='Cold outbound (qualified first)'; cfg[n]['conv']=0.10; b5=total(cfg); steps.append(('Cold reset: qualify-first + entry package', b5-b4))
print('base', round(b0), 'stretch', round(b5)); [print(f"  {a}: +{round(b):,}") for a,b in steps]
out['attribution'] = [{'bet':a,'incremental_collected':round(b)} for a,b in steps]; out['base_collected']=round(b0); out['stretch_collected']=round(b5)
out['payment_lag_cdf']=CDF
out['history_2025'] = dict(cash_deals=int(len(cash)), cash_value=int(cash.confirmed_value_inr.sum()), all_confirmed=int(len(conf)), all_value=int(conf.confirmed_value_inr.sum()),
  share_cash_value_lt30d=float(cash[cash.days_before<30].confirmed_value_inr.sum()/cash.confirmed_value_inr.sum()), modeled_2025_collected_std=round(R['all_std']*cash.confirmed_value_inr.sum()))
json.dump(out, open('/home/claude/model/model.json','w'), indent=1)
