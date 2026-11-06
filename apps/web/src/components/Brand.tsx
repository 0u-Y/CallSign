export function Brand({ compact = false, recording = false }: { compact?: boolean; recording?:boolean }) {
  return (
    <span className="brand" aria-label="CallSign 기관 발신 인증 서비스">
      <img className={"brand-mark callsign-logo"+(recording?" recording-mark":"")} src="/callsign-logo.png" alt="" width={40} height={40}/>
      <span><strong>CallSign</strong>{!compact && <small>기관 발신 인증</small>}</span>
    </span>
  );
}
