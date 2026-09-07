import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, Tabs, Typography } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { ModuleRegistry } from 'ag-grid-community';
import { ExcelExportModule } from 'ag-grid-enterprise';
import { EditDemo } from './EditDemo';
import { PerfLab } from './PerfLab';

// 엑셀 내보내기는 Enterprise 모듈이다. 라이선스 키가 없으면 콘솔 경고와 워터마크가 뜨지만 동작은 한다
ModuleRegistry.registerModules([ExcelExportModule]);

function App() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <Typography.Title level={3}>react-common-module 예제</Typography.Title>
      <Tabs
        // 성능 탭에서 80k 를 올려 둔 채 편집 탭으로 가면 메모리가 그대로 남는다.
        // destroyInactiveTabPane 으로 탭을 떠날 때 그리드를 정리한다
        destroyInactiveTabPane
        items={[
          { key: 'edit', label: 'fullRow 편집 + 엑셀', children: <EditDemo /> },
          { key: 'perf', label: '80k 성능 테스트', children: <PerfLab /> },
        ]}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={koKR}>
      <App />
    </ConfigProvider>
  </StrictMode>,
);
