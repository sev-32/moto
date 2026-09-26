
(()=>{
  const clean=n=>Number.isFinite(Number(n))?Number(n):0;
  const snapshot=()=>{
    try{
      if(typeof bike==='undefined'||typeof SPEC==='undefined'||!bike)return null;
      return {
        schema:'ducati916.v84-suspension-read-bridge.v2_5',
        vehicle:{
          x:clean(bike.x),y:clean(bike.y),u:clean(bike.u),v:clean(bike.v),phi:clean(bike.phi),psi:clean(bike.psi),delta:clean(bike.delta),
          zF:clean(bike.zF),zR:clean(bike.zR),zFd:clean(bike.zFd),zRd:clean(bike.zRd),NF:clean(bike.NF),NR:clean(bike.NR),
          wF:clean(bike.wF),wR:clean(bike.wR),rpm:clean(bike.rpm),pitchW:clean(bike.pitchW),frameTwist:clean(bike.frameTwist),forkTwist:clean(bike.forkTwist),
          sprungF:clean(bike._zsF),sprungFd:clean(bike._zsFd),sprungR:clean(bike._zsR),sprungRd:clean(bike._zsRd),
          unsprungF:clean(bike.tF?.zu),unsprungFd:clean(bike.tF?.zud),unsprungR:clean(bike.tR?.zu),unsprungRd:clean(bike.tR?.zud)
        },
        suspension:{
          passiveF:clean(bike.suspPassiveForceF),passiveR:clean(bike.suspPassiveForceR),totalF:clean(bike.suspTotalForceF),totalR:clean(bike.suspTotalForceR),
          springF:clean(bike.suspSpringForceF),springR:clean(bike.suspSpringForceR),damperF:clean(bike.suspDamperForceF),damperR:clean(bike.suspDamperForceR),
          bumpF:clean(bike.suspBumpForceF),bumpR:clean(bike.suspBumpForceR),forkStiction:clean(bike.forkStictionForceN),rearDriveGeneralized:clean(bike.rearDriveSuspensionForceN),
          contactLossF:clean(bike.suspContactLossF),contactLossR:clean(bike.suspContactLossR)
        },
        contact:{
          FxF:clean(bike.tF?.Fx),FyF:clean(bike.tF?.Fy),FxR:clean(bike.tR?.Fx),FyR:clean(bike.tR?.Fy),
          FxFBody:clean(bike.FxFBody),FyFBody:clean(bike.FyFBody),FxRBody:clean(bike.FxR),FyRBody:clean(bike.FyR)
        },
        spec:{travelF:clean(SPEC.travelF),travelR:clean(SPEC.travelR),sagF:clean(SPEC.sagF),sagR:clean(SPEC.sagR),rakeRad:clean(SPEC.rake),motionRatio:clean(SPEC.motionRatio)}
      };
    }catch(error){return {schema:'ducati916.v84-suspension-read-bridge.v2_5',error:String(error&&error.stack||error)};}
  };
  window.DUCATI916_V84_SUSPENSION_BRIDGE_V25=Object.freeze({schema:'ducati916.v84-suspension-read-bridge.v2_5',authority:'READ_ONLY_V84_STATE_EXPORT',mayWrite:false,snapshot});
})();
