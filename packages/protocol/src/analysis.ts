import {z} from 'zod';
// Advisory output only. This schema is not part of a signed authority policy.
export const riskCategorySchema=z.enum(['송금 유도','원격제어 설치','인증번호 요구','비밀 유지 강요']);
export const riskAnalysisSchema=z.object({signals:z.array(z.object({category:riskCategorySchema,evidenceSpan:z.string().min(1).max(160),explanation:z.string().min(1).max(400)}).strict()).max(8),recommendedAction:z.string().min(1).max(600),limitations:z.string().min(1).max(600)}).strict();
export type RiskAnalysis=z.infer<typeof riskAnalysisSchema>;
export const purposeAssessmentSchema=z.object({relation:z.enum(['suspected','not-detected','undetermined']),evidenceSpan:z.string().max(600),reason:z.string().min(1).max(400)}).strict().refine(p=>p.relation!=='suspected'||p.evidenceSpan.length>0,'Suspected deviation requires an exact quote');
export const serviceAnalysisSchema=riskAnalysisSchema.extend({purpose:purposeAssessmentSchema.optional()});
export type ServiceAnalysis=z.infer<typeof serviceAnalysisSchema>;
export const legacyServiceAnalysisEventSchema=z.object({streamId:z.string().min(1).max(100),segmentId:z.string().max(100),revision:z.number().int().nonnegative(),contextRevision:z.number().int().positive(),eventSequence:z.number().int().positive(),contextId:z.string().regex(/^[0-9a-f]{64}$/),dependencies:z.array(z.object({segmentId:z.string().max(100),revision:z.number().int().positive()}).strict()).max(6),policyHash:z.string().regex(/^[0-9a-f]{64}$/),policyVersion:z.number().int().positive(),analyzerVersion:z.literal('purpose-context-1'),status:z.enum(['partial','analyzing','analyzed','unavailable','withdrawn']),engine:z.string().max(40),signals:riskAnalysisSchema.shape.signals,purpose:purposeAssessmentSchema}).strict();


export const transcriptRevisionSchema = z.object({
  streamId: z.string().min(1).max(100), segmentId: z.string().min(1).max(100), revision: z.number().int().positive(),
  final: z.boolean(), text: z.string().max(4000), source: z.literal("remote"),
}).strict();
export type TranscriptRevision = z.infer<typeof transcriptRevisionSchema>;

// V2 is risk-only. Snapshot IDs are supplied by the server, never inferred from a quote's first match.
export const riskCodeSchema=z.enum(['OTP','TRANSFER','REMOTE_CONTROL','SECRECY']);
export const RISK_CRITERIA={
 OTP:'인증번호·일회용 비밀번호 등 인증 비밀을 상대에게 전달하라는 요구',
 TRANSFER:'수신자에게 자금을 이체하거나 입금하라는 요구',
 REMOTE_CONTROL:'원격제어 도구 설치 또는 원격 접근을 허용하라는 요구',
 SECRECY:'은행·가족 등 독립적인 상담이나 확인을 막는 요구',
} as const;
export const riskClassificationSchema=z.enum(['detected','not-detected','undetermined']);
export const riskProviderOutputSchema=z.object({assessments:z.array(z.object({
 code:riskCodeSchema,result:riskClassificationSchema,
 evidenceIds:z.array(z.string().regex(/^u[0-5]$/)).max(6),
 explanation:z.string().trim().min(1).max(160),
}).strict()).max(4)}).strict();
export type RiskProviderOutput=z.infer<typeof riskProviderOutputSchema>;
export const riskEvidenceSchema=z.object({
 segmentId:z.string().min(1).max(100),revision:z.number().int().positive(),
 quote:z.string().min(1).max(4000).refine(s=>s.trim().length>0,'Nonblank quote required'),
 state:z.enum(['active','withdrawn']),
 withdrawal:z.object({segmentId:z.string().min(1).max(100),revision:z.number().int().positive(),quote:z.string().min(1).max(4000)}).strict().optional(),
}).strict();
export const riskAssessmentSchema=z.object({
 code:riskCodeSchema,result:riskClassificationSchema,source:z.enum(['rules','llm']),
 explanation:z.string().min(1).max(400),evidence:z.array(riskEvidenceSchema).max(6),evaluatedContextRevision:z.number().int().positive().optional(),
}).strict();
export type RiskAssessment=z.infer<typeof riskAssessmentSchema>;

export const serviceRiskEventSchema=legacyServiceAnalysisEventSchema.omit({purpose:true}).extend({
 analyzerVersion:z.literal('risk-context-2'),promptVersion:z.literal('callsign-risk-2'),
 assessments:z.array(riskAssessmentSchema).max(8),
 signals:z.array(riskAnalysisSchema.shape.signals.element.extend({evidenceSpan:z.string().min(1).max(4000)})).max(8),
 action:z.string().min(1).max(300),limitations:z.string().min(1).max(400),
}).strict();
// Read legacy events explicitly during coordinated frontend/backend rollout; never invent a purpose verdict.
export const serviceAnalysisEventSchema=z.union([serviceRiskEventSchema,legacyServiceAnalysisEventSchema]);
export type ServiceAnalysisEvent=z.infer<typeof serviceAnalysisEventSchema>;
