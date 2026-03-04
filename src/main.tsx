import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  DropdownProvider,
  FontsVTBGroup,
  LIGHT_THEME,
} from '@admiral-ds/react-ui';
import 'antd/dist/reset.css';
import { ThemeProvider } from 'styled-components';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={LIGHT_THEME}>
      <DropdownProvider>
        <FontsVTBGroup />
        <App />
      </DropdownProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
