import {z} from 'zod';
// Advisory output only. This schema is not part of a signed authority policy.
export const riskCategorySchema=z.enum(['송금 유도','원격제어 설치','인증번호 요구','비밀 유지 강요']);
export const riskAnalysisSchema=z.object({signals:z.array(z.object({category:riskCategorySchema,evidenceSpan:z.string().min(1).max(160),explanation:z.string().min(1).max(400)}).strict()).max(8),recommendedAction:z.string().min(1).max(600),limitations:z.string().min(1).max(600)}).strict();
export type RiskAnalysis=z.infer<typeof riskAnalysisSchema>;
export const purposeAssessmentSchema=z.object({relation:z.enum(['suspected','not-detected','undetermined']),evidenceSpan:z.string().max(600),reason:z.string().min(1).max(400)}).strict().refine(p=>p.relation!=='suspected'||p.evidenceSpan.length>0,'Suspected deviation requires an exact quote');
export const serviceAnalysisSchema=riskAnalysisSchema.extend({purpose:purposeAssessmentSchema.optional()});
export type ServiceAnalysis=z.infer<typeof serviceAnalysisSchema>;
export const serviceAnalysisEventSchema=z.object({streamId:z.string().min(1).max(100),segmentId:z.string().max(100),revision:z.number().int().nonnegative(),contextRevision:z.number().int().positive(),eventSequence:z.number().int().positive(),contextId:z.string().regex(/^[0-9a-f]{64}$/),dependencies:z.array(z.object({segmentId:z.string().max(100),revision:z.number().int().positive()}).strict()).max(6),policyHash:z.string().regex(/^[0-9a-f]{64}$/),policyVersion:z.number().int().positive(),analyzerVersion:z.literal('purpose-context-1'),status:z.enum(['partial','analyzing','analyzed','unavailable','withdrawn']),engine:z.string().max(40),signals:riskAnalysisSchema.shape.signals,purpose:purposeAssessmentSchema}).strict();
export type ServiceAnalysisEvent=z.infer<typeof serviceAnalysisEventSchema>;
