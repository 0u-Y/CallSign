import { sql } from "drizzle-orm";
import type { Database } from "./db.js";
import { tasks, users } from "./schema.js";

export const demoUsers = [
  { id: "recipient_alice_01HZZZZZZZZZZZZZZZZZZZZZZZ", displayName: "Alice (테스트 이용자)", role: "recipient", demoCode: "alice-demo" },
  { id: "recipient_bob_01HZZZZZZZZZZZZZZZZZZZZZZZZ", displayName: "Bob (테스트 이용자)", role: "recipient", demoCode: "bob-demo" },
  { id: "institution_a_01HZZZZZZZZZZZZZZZZZZZZZZZ", displayName: "모의 A시청 담당자", role: "institution", demoCode: "institution-demo" },
  { id: "gateway_c_01HZZZZZZZZZZZZZZZZZZZZZZZZZ", displayName: "위탁센터 C 상담원", role: "gateway", demoCode: "gateway-demo" },
  { id: "approver_1_01HZZZZZZZZZZZZZZZZZZZZZZZZ", displayName: "공동 승인자 1", role: "approver", demoCode: "approver-1-demo" },
  { id: "approver_2_01HZZZZZZZZZZZZZZZZZZZZZZZZ", displayName: "공동 승인자 2", role: "approver", demoCode: "approver-2-demo" },
  { id: "approver_3_01HZZZZZZZZZZZZZZZZZZZZZZZZ", displayName: "공동 승인자 3", role: "approver", demoCode: "approver-3-demo" },
  { id: "demo_operator_01HZZZZZZZZZZZZZZZZZZZZZZ", displayName: "로컬 데모 운영자", role: "demo_operator", demoCode: "operator-demo" },
] as const;

export async function seedDatabase(db: Database): Promise<void> {
  await db.insert(users).values([...demoUsers]).onConflictDoNothing();
  await db.insert(tasks).values([
    {
      id: "task_alice_document_01HZZZZZZZZZZZZZZZZZZ",
      ownerId: demoUsers[0].id,
      institutionId: "inst_mock_a_city_01HZZZZZZZZZZZZZZZZ",
      opaqueId: "opaque_01HZZZZZZZZZZZZZZZZZZZZZZZZ",
      title: "서류 보완 확인",
      status: "보완 요청",
      detail: "합성 데이터: 제출 서류의 발급일자를 확인해 주세요.",
    },
    {
      id: "task_bob_reply_01HZZZZZZZZZZZZZZZZZZZZZ",
      ownerId: demoUsers[1].id,
      institutionId: "inst_mock_a_city_01HZZZZZZZZZZZZZZZZ",
      opaqueId: "opaque_01HYYYYYYYYYYYYYYYYYYYYYYYYY",
      title: "민원 회신 확인",
      status: "회신 도착",
      detail: "합성 데이터: 접수한 민원의 모의 회신입니다.",
    },
  ]).onConflictDoNothing();
  await db.execute(sql`DELETE FROM sessions WHERE expires_at <= now()`);
}
