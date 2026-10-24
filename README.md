# DESIGN Studio

[jangtrinh/design-os-studio](https://github.com/jangtrinh/design-os-studio)(Rust 네이티브 디자인 스튜디오)의 핵심 개념을 웹으로 포팅한 로컬 퍼스트 디자인 도구입니다. 백엔드 없이 브라우저에서만 동작하고, 모든 데이터는 브라우저 저장소와 JSON 파일로만 다룹니다.

## 실행

```bash
pnpm install   # 이미 완료되어 있음
pnpm dev       # http://localhost:5173
pnpm build     # dist/ 프로덕션 번들 (tsc --noEmit + vite build)
```

## 배포 (GitHub Pages)

정적 앱이라 서버가 필요 없습니다. `base: "./"` 상대 경로로 빌드되어 어떤 서브경로 호스팅에서도 동작합니다.

1. GitHub에 저장소를 만들고 push합니다. 워크플로우 `.github/workflows/deploy.yml`이 main 브랜치 push마다 빌드해 Pages에 배포합니다.
2. 저장소 Settings → Pages → Source를 **GitHub Actions**로 지정합니다.
3. 이후 push는 자동으로 배포됩니다. 수동 배포는 Actions 탭에서 workflow를 실행합니다.

Cloudflare Pages / Vercel / Netlify도 가능합니다. 빌드 커맨드 `pnpm build`, 출력 디렉터리 `dist`를 지정하세요.

## 기능

- **문서 모델**: 프레임/텍스트/사각형/타원 노드 트리. 원본의 선언적 `NodeSpec` JSON과 필드 호환.
- **Auto-Layout**: row/column 재귀 배치, gap/padding/align/justify, 노드별 Hug/Fill/Fixed 크기.
- **라이브 변수**: `$collection.path` 별칭으로 색을 토큰에 바인딩. Light/Dark 모드 전환 시 캔버스가 즉시 재렌더됩니다. 변수 패널에서 모드별 값을 편집할 수 있습니다.
- **캔버스 편집**: 클릭 선택, 드래그 이동(auto-layout 부모 안에서는 순서 변경), 8핸들 리사이즈, 스페이스 팬, ⌘+휠 줌, 더블클릭 텍스트 인라인 편집, ⌘C/⌘X/⌘V 클립보드.
- **Dev Mode**(`Shift+D`): 선택 노드 서브트리를 React / CSS / Tailwind / SwiftUI / Jetpack Compose 코드로 생성하고 클립보드로 복사. 웹 타깃은 변수를 CSS 변수(`var(--token)`)로, 네이티브 타깃은 리졸브된 색 리터럴로 내보냅니다.
- **이미지 내보내기**: 선택 서브트리(미선택 시 전체)를 SVG 또는 2x PNG로 내려받습니다.
- **문서 IO**: NodeSpec JSON 스펙 적용(검증 후 원자적 적용, ⌘Z로 되돌리기), 문서 JSON 내보내기/가져오기, 500ms 디바운스 자동 저장(localStorage, `schemaVersion: 1`).
- **시작 문서**: 원본의 `easeui-agent-console.spec.json`(53노드)이 변환되어 로드됩니다.

## 단축키

| 키 | 동작 |
| --- | --- |
| `V` `F` `T` `R` `O` | 선택 / 프레임 / 텍스트 / 사각형 / 타원 도구 |
| `Shift+D` | Dev Mode 토글 |
| `⌘Z` / `⌘⇧Z` | 실행 취소 / 다시 실행 (스택 상한 50) |
| `⌘D` | 선택 노드 복제 |
| `⌘C` / `⌘X` / `⌘V` | 복사 / 잘라내기 / 붙여넣기 |
| 텍스트 더블클릭 | 인라인 텍스트 편집 (Enter 확정, Esc 취소) |
| `Delete` | 선택 노드 삭제 |
| `Space` + 드래그 | 캔버스 팬 |
| `⌘` + 휠 | 줌 (커서 기준) |

## 범위 (원본 대비)

포함: 문서 모델, auto-layout 엔진, 변수 시스템(Light/Dark), Dev Mode 코드젠 3타깃, NodeSpec 적용, undo, UI3 다크 테마(#1e1e1e / #2c2c2c / #0d99ff / #9747ff / #0c8ce9, Inter).

미포함: `.fig` v106 바이너리 입출력, PTY 에이전트 채팅, MCP 서버, GPU 렌더러, 100개 마이크로 인터랙션, 멀티플레이어/클라우드. 이 기능들은 원본의 Rust 엔진에 묶여 있거나 서비스 범위 밖입니다.

## 구조

```
src/
  model/     types(도메인 타입) · variables(별칭 해석) · relayout(auto-layout 엔진) · fixtures(스펙 파서)
  state/     store(useReducer + undo 스택)
  canvas/    CanvasView(렌더 + 포인터 상호작용)
  panels/    Toolbar · LayersPanel · Inspector · VariablesPanel
  devmode/   codegen(React/CSS/Tailwind) · CodegenPanel
  io/        documentIo(스펙 검증/적용, 파일 IO, autosave)
  app/       shortcuts(전역 키)
```
