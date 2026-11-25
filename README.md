# LaTeX Prose Wrap

VS Code에서 LaTeX 본문을 Vim `gw`처럼 일정 폭으로 다시 감싼다.
기본 폭은 **80열**이며 문장별로 강제 개행하지 않는다.

- `section`, `subsection`, `paragraph`, `label`과 빈 줄을 유지한다.
- 본문 단어 사이 공백은 한 칸으로 정리하고, 기존 들여쓰기는 유지한다.
- 일반 본문과 `itemize`/`enumerate`의 본문을 감싼다.
- 인용·참조 명령과 짧은 인라인 수식은 중간에서 나누지 않는다.
- 주석, 리뷰 매크로(`\me`, `\jh`, `\todo`), 그림·표·display 수식·verbatim 및
  알려지지 않은 환경은 그대로 둔다. 여러 줄에 걸친 복잡한 명령 인자도 보존한다.
- 나눌 수 없는 긴 명령·수식이나 보존되는 줄은 80열을 넘을 수 있다.
- **Format Document**와 **Format Selection**을 지원한다. 선택 영역은 닿는 본문
  문단 전체로 확장한다. 파일의 내용이나 문단 순서를 바꾸지 않는다.

설치 시 LaTeX/TeX의 기본 formatter를 `local.latex-prose-wrap`으로 지정한다.
`formatOnSave`, 단축키, 자동 저장 설정은 변경하지 않는다. 워크스페이스에서
별도의 기본 formatter를 지정했다면 그 설정이 전역 설정보다 우선한다.

줄 폭은 설정에서 바꿀 수 있다:

```json
"latexProseWrap.column": 80
```

외부 프로그램이나 npm 패키지 없이 실행된다. 현재 SSH 서버에 설치하면 해당
서버에 연결한 VS Code의 모든 프로젝트에서 사용할 수 있다. 다른 PC에는 생성된
VSIX를 **Extensions: Install from VSIX...**로 설치하면 된다.

개발 및 미리보기:

```sh
npm test
npm run package
python3 install_global.py          # 전역 설정 변경 내용 미리보기
python3 install_global.py --install
node cli.js --column 80 < input.tex > /tmp/formatted.tex
```

실제 원고는 formatter를 실행하기 전까지 수정하지 않는다.

API: [VS Code formatting provider](https://code.visualstudio.com/api/references/vscode-api#languages.registerDocumentRangeFormattingEditProvider),
[VSIX 설치](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#_install-from-a-vsix).
# vscode-tex-formatter
# vscode-tex-formatter
# vscode-tex-formatter
