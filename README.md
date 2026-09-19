# CCW AI 스프린트 · 파이널 스프린트

`AI와 함께 더 멀리 달리는 K-콘텐츠` — 결선 10인 안내 · 대면 멘토링 예약 · 결과물 제출 안내 · 청중 투표.

정적 페이지 한 장 + Vercel 서버리스 함수 몇 개로 돌아갑니다. **빌드 단계도, npm 의존성도 없습니다.**
데이터는 구글 시트에 그대로 쌓이므로 사무국이 시트를 직접 열어 보고 고칠 수 있습니다.

```
index.html             화면 전체 (HTML/CSS/JS 한 파일)
api/auth.js            비밀번호 확인
api/state.js           공개 상태 — 예약된 슬롯, 투표 기간, 내 투표 내역
api/book.js            대면 멘토링 신청 / 취소 (선착순)
api/vote.js            청중 투표 (번호당 3표)
api/admin.js           운영 현황 + CSV 내려받기
api/setup.js           시트 탭·헤더 최초 생성
api/_lib/              시트 드라이버 · 저장소 어댑터 · 공용 유틸
scripts/dev-server.js  로컬 확인용 서버
```

---

## 1. 구글 시트 준비

저장소는 두 가지 방식 중 하나를 고르면 됩니다. **A안(Apps Script)을 권장합니다.**
구글 클라우드 프로젝트도, 서비스 계정도, JSON 키도 필요 없어서 조직 보안 정책에 막히지 않습니다.

### 1-1. 스프레드시트 만들기 (두 방식 공통)
1. https://sheets.new 에서 새 시트를 만듭니다.
2. 이름을 `CCW Final sprint 운영` 처럼 알아보기 쉽게 바꿉니다.
3. 주소창의 `https://docs.google.com/spreadsheets/d/`**`여기_긴_문자열`**`/edit` 에서
   가운데 긴 문자열이 **SHEET_ID** 입니다. (A안에서는 쓰지 않습니다)

> 탭(`bookings`, `votes`)은 직접 만들 필요 없습니다. 자동으로 생깁니다.

---

### A안 (권장) — Apps Script 웹 앱

시트에 스크립트를 붙여서, **시트 주인 권한으로** 읽고 씁니다.

1. 시트에서 **확장 프로그램 → Apps Script**
2. 편집기의 내용을 모두 지우고 이 저장소의 [`apps-script/Code.gs`](apps-script/Code.gs) 내용을 **전부** 붙여넣습니다.
3. 맨 위 `var SECRET = "..."` 를 길고 아무도 모르는 문자열로 바꿉니다. (예: 무작위 32자)
4. 💾 저장 → 우측 상단 **배포 → 새 배포**
   - 톱니바퀴 → **웹 앱**
   - 설명: `ccw`
   - **실행 계정: 나**
   - **액세스 권한: 모든 사용자** ← 이게 아니면 로그인 화면이 돌아와 실패합니다
   - **배포** → 권한 승인 (본인 계정 선택 → 고급 → 이동 → 허용)
5. 나온 **웹 앱 URL**(`.../exec` 로 끝남)을 복사합니다.

Vercel 환경변수:

| 이름 | 값 |
|---|---|
| `APPS_SCRIPT_URL` | 5번의 `/exec` 주소 |
| `APPS_SCRIPT_SECRET` | 3번에서 정한 문자열 |

> 코드를 고쳐 다시 배포할 때는 **배포 관리 → 연필 → 버전: 새 버전 → 배포** 로 하세요.
> "새 배포"를 다시 누르면 주소가 바뀝니다.

---

### B안 — 서비스 계정 (Sheets API 직접 호출)

조직 정책이 서비스 계정 키 생성을 막지 않는 경우에만 됩니다.

1. https://console.cloud.google.com/projectcreate → 프로젝트 `ccw-ai-sprint` → **만들기**
   (위치가 `조직 없음` 인지 확인)
2. https://console.cloud.google.com/apis/library/sheets.googleapis.com → **사용 설정**
3. https://console.cloud.google.com/iam-admin/serviceaccounts → **서비스 계정 만들기**
   - 이름 `ccw-sheets` → **만들고 계속하기** → 역할 없이 → **완료**
4. 계정 클릭 → **키** 탭 → **키 추가 → 새 키 만들기 → JSON** → **만들기**
5. JSON 의 `client_email` 주소를 1-1 시트에 **편집자**로 공유합니다. (빠뜨리면 403)

Vercel 환경변수: `SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`

---

## 2. Vercel 배포

1. 이 저장소를 https://vercel.com/new 에서 **Import** 합니다.
2. Framework Preset 은 **Other** 그대로 둡니다. 빌드 명령·출력 디렉터리 모두 비워 둡니다.
3. **Environment Variables** 에 아래를 넣습니다 (Production / Preview / Development 모두 체크).

| 이름 | 값 |
|---|---|
| `APPS_SCRIPT_URL` | A안 5번의 `/exec` 주소 |
| `APPS_SCRIPT_SECRET` | A안 3번에서 정한 문자열 |
| `FINALIST_PW` | 진출자 10인에게 안내할 비밀번호 |
| `ADMIN_PW` | 운영사무국 비밀번호 |
| `PHONE_SALT` | 아무 긴 문자열. 휴대폰 번호를 해시할 때 씁니다 |

> B안을 쓰신다면 `APPS_SCRIPT_*` 대신 `SHEET_ID` · `GOOGLE_SERVICE_ACCOUNT_EMAIL` · `GOOGLE_PRIVATE_KEY` 를 넣습니다.
> `GOOGLE_PRIVATE_KEY` 는 JSON 에 적힌 그대로(줄바꿈이 `\n` 문자로 들어 있는 상태) 붙여넣으면 됩니다.

선택 사항 — 투표 기간을 코드 수정 없이 바꾸고 싶을 때:

| 이름 | 기본값 |
|---|---|
| `VOTE_OPEN` | `2026-11-23T00:00:00+09:00` |
| `VOTE_CLOSE` | `2026-12-04T14:00:00+09:00` |

4. **Deploy** 를 누릅니다.

---

## 3. 도메인 연결

Vercel 프로젝트 → **Settings → Domains** 에서 `ccw-ai-sprint.vercel.app` 을 추가합니다.
기존 프로젝트가 그 주소를 쓰고 있다면, 먼저 거기서 도메인을 떼어낸 뒤 이 프로젝트에 붙입니다.

---

## 4. 시트 탭 만들기 (배포 후 한 번)

배포된 주소에서 아래를 한 번 호출하면 `bookings` · `votes` 탭과 헤더가 생깁니다.

```bash
curl -H "x-ccw-pw: 운영사무국_비밀번호" https://ccw-ai-sprint.vercel.app/api/setup
```

`{"ok":true,"store":"script"}` (또는 `"sheets"`) 가 나오면 끝입니다.

---

## 5. 시트 구조

**bookings** — 대면 멘토링 (10월 2일)

| id | name | slot | method | created_at | status |
|---|---|---|---|---|---|
| uuid | 성원제 | 11:00 | 대면 | 2026-09-22T05:08:12.000Z | 확정 / 취소 |

**votes** — 청중 투표. 한 표가 한 줄입니다.

| id | created_at | phone_hash | phone_masked | target_id | target_name | ip | ip_masked | status |
|---|---|---|---|---|---|---|---|---|
| uuid | 2026-11-24T… | a1b2… | 010-****-5678 | 4 | 신은정 | 1.2.3.4 | 1.2.***.4 | 유효 / 취소 |

- `phone_hash` 는 번호를 `PHONE_SALT` 로 해시한 값입니다. 같은 번호인지 판별하는 용도이고, 원번호는 복원되지 않습니다.
- `phone_masked` 는 사람이 눈으로 확인하기 위한 표시용입니다.
- 표를 무효로 하려면 시트에서 `status` 를 `취소` 로 바꾸면 됩니다. 즉시 집계에서 빠집니다.

---

## 6. 운영 중 자주 쓰는 것

- **대면 예약 현황** — 사이트 멘토링 탭에 예약자 이름이 그대로 보입니다. 시트 `bookings` 탭도 같습니다.
- **예약 수동 조정** — 시트에서 `status` 를 `취소` 로 바꾸면 그 자리가 다시 열립니다.
- **투표 원장 CSV** — 관리 탭 → `투표 원장 · 번호별 투표 내역` → CSV 내려받기.
  어떤 번호가 누구에게 투표했는지 한 줄씩 들어 있습니다. 엑셀에서 바로 열립니다.
- **중복 자동 제외** — 같은 IP 에서 5표 이상 들어오면 그 IP 의 표를 전부 집계에서 뺍니다.
  공용 와이파이에서는 정상 투표도 함께 걸릴 수 있으니 CSV 로 최종 확인해 주세요.

---

## 7. 로컬에서 확인하기

구글 시트 없이 메모리만으로 돌려볼 수 있습니다 (서버를 끄면 데이터는 사라집니다).

```bash
STORE=memory FINALIST_PW=진출자에게-안내할-비밀번호 ADMIN_PW=운영사무국-비밀번호 \
VOTE_OPEN=2020-01-01T00:00:00Z \
node scripts/dev-server.js
# http://localhost:3000
```

---

## 알아두실 점

- 비밀번호는 진출자 10인이 **공유**하는 값입니다. 비밀번호를 아는 사람은 명단의 아무 이름으로나
  예약하거나 취소할 수 있습니다. 10명이 서로 아는 사이라는 전제에서 만든 구조입니다.
- 휴대폰 번호 입력만으로는 한 사람이 번호를 여러 개 써서 투표하는 것을 막을 수 없습니다.
  IP 기준 자동 제외와 CSV 확인이 이를 보완합니다.
- 비대면 멘토링은 [되는시간](https://whattime.co.kr/scopelabs/ccw-05)에서 관리하며 이 사이트와 연동되지 않습니다.
