// A volume-preserving elastic surface on each Matter body. Its deformed convex
// hull is used by the collision solver, not only by the renderer.
export const GEL_NODES = 32;
const TAU = Math.PI * 2;
const clamp = (v,a,b) => Math.max(a,Math.min(v,b));

export function createGel(body,radius) {
  return { radius, mass: body.mass, inertia: body.inertia, area: body.area,
    radii: Array(GEL_NODES).fill(1), speeds: Array(GEL_NODES).fill(0),
    contacts: [], last: null, vx: 0, vy: 0 };
}

export function prepareGel(balls) {
  for(const b of balls){const g=b.plugin.gel;g.contacts=[];g.vx=b.velocity.x;g.vy=b.velocity.y;}
}

export function updateGel(Matter,balls,pairs,dt) {
  const living=new Set(balls);
  for(const p of pairs){
    if(!p.isActive)continue;
    const a=p.bodyA,b=p.bodyB,n=p.collision.normal;
    if(living.has(a))contact(a,b,-n.x,-n.y);
    if(living.has(b))contact(b,a,n.x,n.y);
  }

  function contact(body,other,nx,ny){
    const g=body.plugin.gel,otherGel=other.plugin.gel;
    const impact=Math.max(0,(g.vx-(otherGel?.vx||0))*nx+(g.vy-(otherGel?.vy||0))*ny);
    const load=other.isStatic?1:Math.min(4,other.mass/body.mass);
    const pressure=clamp(.028+g.radius*.0011+load*.021+impact*.010,0,.28);
    g.contacts.push({nx,ny,pressure,impact});
  }

  const h=dt/1000;
  for(const b of balls){
    if(b.isSleeping)continue;
    const g=b.plugin.gel;
    let changed=false;
    for(let i=0;i<GEL_NODES;i++){
      const theta=TAU*(i+.5)/GEL_NODES+b.angle;
      const dx=Math.cos(theta),dy=Math.sin(theta);
      let dent=0;
      for(const c of g.contacts){
        const dot=Math.max(0,dx*c.nx+dy*c.ny);
        dent+=c.pressure*dot**4;
        // A landing makes an immediate elastic dent, followed by a damped rebound.
        if(c.impact>2){
          const axial=Math.abs(dx*c.nx+dy*c.ny);
          g.speeds[i]-=Math.min(10,c.impact*.95)*axial**2;
        }
      }
      const target=1-Math.min(.30,dent);
      g.speeds[i]+=(target-g.radii[i])*(280/(1+g.radius*.004))*h;
      g.speeds[i]*=Math.exp(-16*h);
      g.radii[i]=clamp(g.radii[i]+g.speeds[i]*h,.56,1.16);
      if(!g.last||Math.abs(g.radii[i]-g.last[i])>.0004)changed=true;
    }
    if(!changed)continue;
    // Correct radial area so compression displaces material to free sides.
    let product=0;
    for(let i=0;i<GEL_NODES;i++)product+=g.radii[i]*g.radii[(i+1)%GEL_NODES];
    const volumeScale=Math.sqrt(GEL_NODES/product);
    const points=g.radii.map((r,i)=>{
      const theta=TAU*(i+.5)/GEL_NODES+b.angle;
      return {x:Math.cos(theta)*r*g.radius*volumeScale,y:Math.sin(theta)*r*g.radius*volumeScale};
    });
    const hull=Matter.Vertices.hull(points);
    const correction=Math.sqrt(g.area/Matter.Vertices.area(hull));
    for(const point of hull){point.x*=correction;point.y*=correction;}
    Matter.Body.setVertices(b,hull);
    // Deformation must not create mass or rotational energy.
    Matter.Body.setMass(b,g.mass);Matter.Body.setInertia(b,g.inertia);
    b.circleRadius=0;
    g.last=g.radii.slice();
  }
}
