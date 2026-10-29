"""Export post-freeze evidence. Repeating this is not a new unseen evaluation."""
import json
import time
import pandas as pd
from backend.data import ROOT
from backend.service import Lab
from backend.training import load_model, now
from backend.monitoring import monitor


def evaluate():
    start = time.perf_counter()
    lab = Lab()
    experiment = lab.store.experiments()[0]
    rows, results = [], {}
    for metadata in experiment['models']:
        model = load_model(lab.runtime,metadata)
        result = monitor(lab.train,lab.replay_data,model,lab.policy)
        results[metadata['kind']] = result
        rows.append({'model':metadata['title'],'version':metadata['version'],
                     'validation_mae':metadata['validation']['mae'],
                     'replay_mae':result['metrics']['mae'],
                     'replay_rmse':result['metrics']['rmse'],'replay_r2':result['metrics']['r2'],
                     'eligible_before_replay':metadata['eligible']})
    selected = next(m for m in experiment['models'] if m['version']==experiment['selected_version'])
    shifted = monitor(lab.train,lab.replay_data,load_model(lab.runtime,selected),lab.policy,shifted=True)
    output = ROOT/'outputs'
    output.mkdir(exist_ok=True)
    report = {'evaluated_at':now(),'frozen_experiment':experiment,'data':lab.report,'comparison':rows,
              'selected_replay':results[selected['kind']],'synthetic_input_replay':shifted,
              'evaluation_seconds':round(time.perf_counter()-start,6),
              'scope':'Post-freeze historical evaluation. Policy/models were fixed before later labels were scored. Repeated runs do not create fresh holdout evidence.'}
    (output/'reference_evaluation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    (output/'frozen_comparison.json').write_text(json.dumps(experiment,indent=2),encoding='utf-8')
    pd.DataFrame(rows).to_csv(output/'model_comparison.csv',index=False)
    pd.DataFrame(results[selected['kind']]['predictions']).to_csv(output/'replay_predictions.csv',index=False)
    save_chart(report)
    print(json.dumps({'comparison':rows,'synthetic_drift':shifted['drift'],'seconds':report['evaluation_seconds']},indent=2))


def save_chart(report):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import numpy as np
    plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False})
    fig, axes = plt.subplots(1,3,figsize=(15,4.6),gridspec_kw={'width_ratios':[1.2,1.4,1]})
    names=['Mean','Ridge','Forest']; positions=np.arange(3); rows=report['comparison']
    axes[0].bar(positions-.18,[r['validation_mae'] for r in rows],width=.36,label='Validation',color='#a8b6c3')
    axes[0].bar(positions+.18,[r['replay_mae'] for r in rows],width=.36,label='Later replay',color='#ba8448')
    axes[0].set(xticks=positions,xticklabels=names,ylabel='Mean absolute error / source ratio',title='Fixed models, separate dates')
    axes[0].legend(frameon=False,fontsize=9)
    pred=pd.DataFrame(report['selected_replay']['predictions'])
    pred['error']=(pred.actual-pred.prediction).abs()
    daily=pred.groupby('date').error.mean()
    axes[1].plot(np.arange(len(daily)),daily.values,color='#a97031',marker='o',markersize=4)
    ticks=[0,3,6,9,11]
    axes[1].set(xticks=ticks,xticklabels=[daily.index[i][5:] for i in ticks],xlabel='2015 replay date / month-day',ylabel='Daily MAE',title='Selected forest: later errors')
    normal=next(d['psi'] for d in report['selected_replay']['drift'] if d['feature']=='smv')
    shifted=next(d['psi'] for d in report['synthetic_input_replay']['drift'] if d['feature']=='smv')
    axes[2].bar(['Historical','Synthetic ×1.8'],[normal,shifted],color=['#829b8a','#b88043'])
    axes[2].axhline(.2,color='#78818d',linestyle='--',linewidth=1,label='Policy threshold 0.20')
    axes[2].set(ylabel='PSI / training-quantile bins',title='SMV input shift ≠ accuracy loss')
    axes[2].legend(frameon=False,fontsize=8)
    for ax in axes:
        ax.grid(axis='y',alpha=.12);ax.set_axisbelow(True)
    fig.suptitle('Manufacturing Model Reliability Lab — actual post-freeze evaluation',fontsize=14,fontweight='bold',y=1.01)
    fig.text(.02,-.04,'UCI garment-productivity records, 2015. Synthetic input fault has no valid outcomes; no error is scored for it.',fontsize=9,color='#6b7280')
    fig.tight_layout()
    fig.savefig(ROOT/'outputs/reliability_evaluation.png',dpi=160,bbox_inches='tight')
    plt.close(fig)


if __name__=='__main__':
    evaluate()
