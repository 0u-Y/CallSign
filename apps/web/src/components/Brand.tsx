export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand" aria-label="CallSign 기관 발신 인증 서비스">
      <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
        <path d="M8 8h10v10H8zM22 22h10v10H22z" />
        <path d="M18 13h7a7 7 0 0 1 7 7v2M22 27h-7a7 7 0 0 1-7-7v-2" />
      </svg>
      <span><strong>CallSign</strong>{!compact && <small>기관 발신 인증</small>}</span>
    </span>
  );
}
