// Actual shell controls with no backend, media, or model requests.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {Shell} from '../../apps/web/src/components/Shell';
const Surface=()=> <><h1 className="demo-heading">합성 페이지</h1><input aria-label="검색"/><div contentEditable aria-label="편집"/><div className="demo-tools">운영 조작</div><div className="demo-director">Space 안내</div><button className="service-end">통화 종료 · 합성</button></>;
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/demo/work']}><Routes><Route element={<Shell/>}>{['/demo/work','/demo/call','/demo/governance'].map(path=><Route key={path} path={path} element={<Surface/>}/>)}</Route></Routes></MemoryRouter>);
