import {expect,it} from 'vitest';
import {filmingActor} from '../../services/api/src/filming-actor.js';
import type {InstitutionRecord,Actor} from '../../services/api/src/finals-model.js';
const record={id:'synthetic-bank',members:{operator:{role:'institution',active:true},agent:{role:'gateway',active:true,sessionGeneration:2},customer:{role:'recipient',active:true}}} as unknown as InstitutionRecord;
const operator:Actor={institutionId:'synthetic-bank',userId:'operator',role:'institution'};
const config={enabled:true,operatorId:'operator',gatewayId:'agent',recipientId:'customer'};
it('limits one filming session to fixed active synthetic actors',()=>{
 expect(filmingActor(operator,'gateway',record,config)).toMatchObject({userId:'agent',role:'gateway',membershipGeneration:2});
 expect(filmingActor(operator,'recipient',record,config)).toMatchObject({userId:'customer',role:'recipient'});
 for(const role of ['institution','approver','other',null])expect(()=>filmingActor(operator,role,record,config)).toThrow();
 expect(()=>filmingActor({...operator,userId:'other'},'gateway',record,config)).toThrow();
 expect(()=>filmingActor(operator,'gateway',record,{...config,enabled:false})).toThrow();
 record.members.agent!.active=false;expect(()=>filmingActor(operator,'gateway',record,config)).toThrow();
});
