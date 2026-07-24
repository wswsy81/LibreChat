#!/usr/bin/env bash
# 订阅号额度账(供给侧):从 new-api 账本聚合 token 消耗。
# 用法: bash subscription-ledger.sh [天数,默认7]
# 记账单位=token;结算货币=订阅号额度(月费÷月产能)。需求侧按资产归因见 shim llm_job 账本(§8.5)。
set -euo pipefail
DAYS="${1:-7}"
ssh -o BatchMode=yes tencentcloud2 "sudo python3 - <<'PYEOF'
import sqlite3, time
from collections import defaultdict
c=sqlite3.connect('file:/opt/new-api/data/one-api.db?mode=ro',uri=True)
since=int(time.time())-${DAYS}*86400
rows=c.execute('select created_at,token_name,model_name,prompt_tokens,completion_tokens,channel_id from logs where created_at>=? and type=2',(since,)).fetchall()
day=lambda ts:time.strftime('%m-%d',time.localtime(ts))
agg=defaultdict(lambda:[0,0,0])  # (day,token)->calls,in,out
tok=defaultdict(lambda:[0,0,0]); ch=defaultdict(lambda:[0,0,0])
for ts,tn,m,p,co,cid in rows:
    for k in ((day(ts),tn),):
        agg[k][0]+=1; agg[k][1]+=p or 0; agg[k][2]+=co or 0
    tok[tn][0]+=1; tok[tn][1]+=p or 0; tok[tn][2]+=co or 0
    ch[cid][0]+=1; ch[cid][1]+=p or 0; ch[cid][2]+=co or 0
print(f'== 近{${DAYS}}天按 使用方 汇总(calls/输入tok/输出tok) ==')
for tn,(n,i,o) in sorted(tok.items(),key=lambda x:-x[1][1]-x[1][2]):
    print(f'  {tn:14s} {n:6d} 次  in={i/1e6:7.2f}M  out={o/1e6:6.2f}M  合计={(i+o)/1e6:7.2f}M')
print('== 按渠道(1=主力CPA 2=backup-163) ==')
for cid,(n,i,o) in sorted(ch.items()):
    print(f'  ch{cid}: {n} 次  合计 {(i+o)/1e6:.2f}M tok')
print('== 逐日×使用方 ==')
for (d,tn),(n,i,o) in sorted(agg.items()):
    print(f'  {d} {tn:14s} {n:5d}次 {(i+o)/1e6:6.2f}M')
PYEOF"
