import { redirect } from "next/navigation";

/**
 * 클라우드 워크북은 목록에서 '불러오기'로 단일 작업공간(/w/guest)에 적재한다(§2.1).
 * v1.0에는 워크북별 딥링크가 없으므로 목록으로 보낸다.
 */
export default async function WorkspacePage() {
  redirect("/workbooks");
}
