import { AlertTriangle, Check, CircleEllipsis, CircleX, Link2Off, Radio } from "lucide-react";

export type VerificationState = "CHECKING" | "APPROVAL_VERIFIED" | "CONNECTING" | "CONNECTED_VERIFIED" | "UNVERIFIED" | "UNAVAILABLE" | "REJECTED" | "ENDED";

export const statusCopy: Record<VerificationState, { title: string; body: string; tone: string }> = {
  CHECKING: { title: "기관 확인 중", body: "승인서와 현재 권한 상태를 확인하고 있습니다.", tone: "checking" },
  APPROVAL_VERIFIED: { title: "기관 발신 승인 확인", body: "기관의 개별 연락 승인을 확인했습니다. 아직 미디어 연결 인증은 아닙니다.", tone: "verified" },
  CONNECTING: { title: "상담 연결 확인 중", body: "서명된 통화 문맥과 실제 브라우저 전송을 대조하고 있습니다.", tone: "checking" },
  CONNECTED_VERIFIED: { title: "승인 상담 연결 확인", body: "승인 문맥과 현재 브라우저 연결을 확인했습니다. 통화 내용 전체의 안전을 뜻하지 않습니다.", tone: "verified" },
  UNVERIFIED: { title: "기관 발신 미확인", body: "증명이 없거나 이 프로필에서 지원되지 않는 연락입니다.", tone: "neutral" },
  UNAVAILABLE: { title: "현재 인증할 수 없음", body: "상태 조회 또는 최신성 확인에 실패했습니다.", tone: "warning" },
  REJECTED: { title: "인증 조건 불충족", body: "수신 대상, 서명, 권한 또는 연결 문맥이 일치하지 않습니다.", tone: "danger" },
  ENDED: { title: "통화 종료", body: "표시된 과거 인증 시점은 현재 연결 상태가 아닙니다.", tone: "neutral" },
};

export function StatusBadge({ state }: { state: VerificationState }) {
  const copy = statusCopy[state];
  const Icon = copy.tone === "verified" ? Check : copy.tone === "danger" ? CircleX : copy.tone === "warning" ? AlertTriangle : state === "UNVERIFIED" ? Link2Off : state === "CONNECTED_VERIFIED" ? Radio : CircleEllipsis;
  return <span className={`status-badge ${copy.tone}`}><Icon size={16} aria-hidden="true" />{copy.title}</span>;
}
