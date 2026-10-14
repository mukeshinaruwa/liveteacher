import { describe, expect, it } from 'vitest';
import { StateMachine } from '../src/orchestrator/state-machine';
describe('orchestrator state machine',()=>{
 it('allows the teaching / interrupt / resume / recap path',()=>{const m=new StateMachine();m.transition('PLANNING');m.transition('TEACHING');m.transition('INTERRUPT');m.transition('RESUMING');m.transition('TEACHING');m.transition('RECAP');m.transition('NEXT_TOPIC');expect(m.status).toBe('NEXT_TOPIC');});
 it('rejects impossible state changes rather than silently corrupting state',()=>{const m=new StateMachine();expect(()=>m.transition('RESUMING')).toThrow(/Invalid class transition/);expect(m.status).toBe('IDLE');});
 it('notifies subscribers with both previous and next state',()=>{const m=new StateMachine();const seen:string[]=[];m.subscribe((next,prev)=>seen.push(`${prev}:${next}`));m.transition('PLANNING');expect(seen).toEqual(['IDLE:PLANNING']);});
});