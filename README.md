# Tab Finder for Papers

A lightweight Chrome MV3 extension for quickly finding open research, PDF, and documentation tabs.
## 배포 상태

- Chrome Extension Store 업로드 진행 중입니다.


## Use

### 개발자 모드로 직접 로드

```powershell
git clone https://github.com/iseungsang01/tab-extension.git
```

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 우측 상단 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 클릭합니다.
4. 클론한 `tab-extension` 폴더를 선택합니다.

### 테스트 실행

```powershell
node --test test/
```

또는:

```powershell
npm test
```

## Basic use

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Click the extension icon and search by tab title or tab memo.

The popup searches the current window by default. Use the scope toggle to include every open browser window.

Each row has editable title and memo fields. Both are saved for the currently open tab and are included in search results.

## Development

Run the pure search tests:

```powershell
npm test
```

No build step is required. Chrome loads the source files directly.

## License

MIT © iseungsang01
