import './style/global.less';
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ConfigProvider, Spin } from '@arco-design/web-react';
import zhCN from '@arco-design/web-react/es/locale/zh-CN';
import { BrowserRouter, Switch, Route, Redirect } from 'react-router-dom';
import PageLayout from './layout';
import { GlobalContext } from './context';
import Login from './pages/login';
import changeTheme from './utils/changeTheme';
import useStorage from './utils/useStorage';
import { useSessionStore } from './store';

function AppBootstrap(props: { children: React.ReactNode }) {
  const { children } = props;
  const bootstrap = useSessionStore((state) => state.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return <>{children}</>;
}

function ProtectedRoute(props: { path: string; component: React.ComponentType }) {
  const { path, component: Component } = props;
  const initialized = useSessionStore((state) => state.initialized);
  const tokens = useSessionStore((state) => state.tokens);

  return (
    <Route
      path={path}
      render={() => {
        if (!initialized) {
          return <Spin style={{ display: 'block', marginTop: 120 }} />;
        }

        if (!tokens?.accessToken) {
          return <Redirect to="/login" />;
        }

        return <Component />;
      }}
    />
  );
}

function LoginRoute() {
  const initialized = useSessionStore((state) => state.initialized);
  const tokens = useSessionStore((state) => state.tokens);

  if (!initialized) {
    return <Spin style={{ display: 'block', marginTop: 120 }} />;
  }

  if (tokens?.accessToken) {
    return <Redirect to="/" />;
  }

  return <Login />;
}

function Index() {
  const lang = 'zh-CN';
  const setLang = () => {
    // 语言已固定为中文，禁止切换
  };
  const [theme, setTheme] = useStorage('arco-theme', 'light');

  useEffect(() => {
    changeTheme(theme);
  }, [theme]);

  const contextValue = {
    lang,
    setLang,
    theme,
    setTheme,
  };

  return (
    <BrowserRouter>
      <ConfigProvider
        locale={zhCN}
        componentConfig={{
          Card: {
            bordered: false,
          },
          List: {
            bordered: false,
          },
          Table: {
            border: false,
          },
        }}
      >
        <GlobalContext.Provider value={contextValue}>
          <AppBootstrap>
            <Switch>
              <Route path="/login" component={LoginRoute} />
              <ProtectedRoute path="/" component={PageLayout} />
            </Switch>
          </AppBootstrap>
        </GlobalContext.Provider>
      </ConfigProvider>
    </BrowserRouter>
  );
}

ReactDOM.render(<Index />, document.getElementById('root'));
