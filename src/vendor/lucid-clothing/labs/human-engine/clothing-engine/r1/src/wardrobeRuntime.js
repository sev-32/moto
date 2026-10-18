import {LucidClothSolverV2} from './lucidClothSolverV2.js';
import {InterGarmentContact} from './interGarmentContact.js';

/** Multi-garment orchestration with explicit soft-contact vs hard-topology closure. */
export class WardrobeRuntime {
  constructor({bodyIndices,bodyPositions,bodyNormals=null,bodyPrevPositions=null,bodySafetyProxy=null}={}){
    this.body={indices:bodyIndices,positions:bodyPositions,normals:bodyNormals,prev:bodyPrevPositions||bodyPositions,safetyProxy:bodySafetyProxy};
    this.garments=[];this.layerContacts=[];this.frame=0;this.lastClosures={};
  }
  addGarment(id,asset,{layer=0,solverOptions={},solverSettings={}}={}){
    if(this.garments.some(g=>g.id===id))throw new Error(`duplicate garment id ${id}`);
    const solver=new LucidClothSolverV2(asset,{bodyIndices:this.body.indices,bodyPositions:this.body.positions,bodyNormals:this.body.normals,bodyPrevPositions:this.body.prev,bodySafetyProxy:this.body.safetyProxy,fit:false,...solverOptions});
    Object.assign(solver.settings,solverSettings||{});const g={id,layer,asset,solver};this.garments.push(g);this.garments.sort((a,b)=>a.layer-b.layer);return g;
  }
  coupleLayers(innerId,outerId,settings={}){
    const inner=this.garments.find(g=>g.id===innerId),outer=this.garments.find(g=>g.id===outerId);if(!inner||!outer)throw new Error(`unknown garment pair ${innerId} -> ${outerId}`);if(outer.layer<=inner.layer)throw new Error(`outer layer must be greater: ${innerId}(${inner.layer}) -> ${outerId}(${outer.layer})`);
    const contact=new InterGarmentContact(inner.solver,outer.solver,{label:`${innerId}->${outerId}`,...settings});this.layerContacts.push({innerId,outerId,contact});return contact;
  }
  setBodySurface(positions,normals=null,prevPositions=null,dt=1/60){this.body.positions=positions;this.body.normals=normals;this.body.prev=prevPositions||this.body.prev;for(const g of this.garments)g.solver.setBodySurface(positions,normals,prevPositions,dt);}
  _convergeSafety(solver,maxPasses=4){
    if(!solver.bodySafetyProxy||!solver.settings.safetyProxy)return 0;let total=0,c=solver._projectSafetyProxy(true);total+=c;for(let k=1;k<maxPasses&&c;k++){c=solver._projectSafetyProxy(true);total+=c;}return total;
  }
  stepFrame(dt){
    this.lastClosures={};
    for(const g of this.garments){
      const solver=g.solver;solver.stepFrame(dt);
      const pairs=this.layerContacts.filter(p=>p.outerId===g.id&&p.contact.settings.enabled);if(!pairs.length)continue;

      // Phase A: ordinary contact thickness + friction, then exactly one bounded
      // material reconciliation stage.  This is where cloth is allowed to regain
      // its edge/bend shape after the collision projector moved it.
      let softCorrections=0;for(const p of pairs)softCorrections+=p.contact.solve(dt,{mode:'soft'});
      const reconcileIterations=Math.max(0,...pairs.map(p=>Math.floor(p.contact.settings.materialReconcileIterations??1)));
      const materialMoved=reconcileIterations?solver.reconcileMaterial({iterations:reconcileIterations,applyTopology:true}):0;
      let safetyCorrections=this._convergeSafety(solver,4);

      // Phase B: no more elastic pullback. Close only the hard topology barrier
      // and the watertight body inequality until both stop invalidating each
      // other.  The hard barrier is intentionally ~0, not the soft comfort gap.
      const maxCycles=Math.max(1,Math.min(6,Math.max(...pairs.map(p=>Math.floor(p.contact.settings.closureCycles??3)))));
      let cycles=0,hardCorrections=0,clean=false,lastAudits=[];
      for(let pass=0;pass<maxCycles;pass++){
        cycles++;for(const p of pairs)hardCorrections+=p.contact.solve(dt,{mode:'hard',applyFriction:false,passes:p.contact.settings.hardPasses??1});
        const sc=this._convergeSafety(solver,4);safetyCorrections+=sc;
        lastAudits=pairs.map(p=>p.contact.audit({mode:'hard'}));
        clean=sc===0&&lastAudits.every(a=>a.behind===0&&a.virtual.behind===0);
        if(clean)break;
      }
      solver.syncRender();
      this.lastClosures[g.id]={softCorrections,materialReconcileIterations:reconcileIterations,materialMoved,safetyCorrections,hardCorrections,cycles,clean,layers:lastAudits};
    }
    this.frame++;
  }
  resetToCurrentPose(){for(const g of this.garments)g.solver.resetToCurrentPose();return this;}
  get(id){return this.garments.find(g=>g.id===id)?.solver||null;}
  metrics(){return {frame:this.frame,garments:Object.fromEntries(this.garments.map(g=>[g.id,{layer:g.layer,...g.solver.metrics()}])),layers:Object.fromEntries(this.layerContacts.map(p=>[`${p.innerId}->${p.outerId}`,{metrics:p.contact.metrics(),softAudit:p.contact.audit({mode:'soft'}),barrierAudit:p.contact.audit({mode:'hard'})}])),closures:this.lastClosures};}
}
