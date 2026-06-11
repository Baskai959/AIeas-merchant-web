import { Form, Input, Checkbox, Button, Space } from '@arco-design/web-react';
import { FormInstance } from '@arco-design/web-react/es/Form';
import { IconLock, IconUser } from '@arco-design/web-react/icon';
import React, { useEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import useStorage from '@/utils/useStorage';
import useLocale from '@/utils/useLocale';
import locale from './locale';
import styles from './style/index.module.less';
import { ApiError } from '@/services/http/client';
import { useSessionStore } from '@/store';

type SavedLoginForm = {
  account: string;
  role: 'merchant';
};

export default function LoginForm() {
  const formRef = useRef<FormInstance>();
  const [errorMessage, setErrorMessage] = useState('');
  const history = useHistory();
  const login = useSessionStore((state) => state.login);
  const loading = useSessionStore((state) => state.authLoading);
  const [savedLogin, setSavedLogin, removeSavedLogin] = useStorage(
    'merchant-login-account'
  );

  const t = useLocale(locale);

  const [rememberAccount, setRememberAccount] = useState(!!savedLogin);

  function persistFormValues(values: SavedLoginForm) {
    if (rememberAccount) {
      setSavedLogin(JSON.stringify(values));
      return;
    }

    removeSavedLogin();
  }

  async function handleLogin(values: { account: string; password: string }) {
    setErrorMessage('');
    try {
      await login({
        ...values,
        role: 'merchant',
      });
      persistFormValues({
        account: values.account,
        role: 'merchant',
      });
      history.replace('/');
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : t['login.form.login.errMsg'];
      setErrorMessage(message);
    }
  }

  function onSubmitClick() {
    formRef.current.validate().then((values) => {
      handleLogin(values);
    });
  }

  useEffect(() => {
    const shouldRemember = !!savedLogin;
    setRememberAccount(shouldRemember);
    if (formRef.current && shouldRemember) {
      const parsedValues = JSON.parse(savedLogin) as SavedLoginForm;
      formRef.current.setFieldsValue(parsedValues);
    }
  }, [savedLogin]);

  return (
    <div className={styles['login-form-wrapper']}>
      <div className={styles['login-form-heading']}>
        <div className={styles['login-form-title']}>
          {t['login.form.title']}
        </div>
        <div className={styles['login-form-sub-title']}>
          {t['login.form.subtitle']}
        </div>
      </div>
      <div className={styles['login-form-error-msg']}>{errorMessage}</div>
      <Form
        className={styles['login-form']}
        layout="vertical"
        ref={formRef}
        initialValues={{ account: 'merchant001' }}
      >
        <Form.Item
          field="account"
          label={t['login.form.account.label']}
          rules={[{ required: true, message: t['login.form.account.errMsg'] }]}
        >
          <Input
            prefix={<IconUser />}
            placeholder={t['login.form.account.placeholder']}
            onPressEnter={onSubmitClick}
          />
        </Form.Item>
        <Form.Item
          field="password"
          label={t['login.form.password.label']}
          rules={[{ required: true, message: t['login.form.password.errMsg'] }]}
        >
          <Input.Password
            prefix={<IconLock />}
            placeholder={t['login.form.password.placeholder']}
            onPressEnter={onSubmitClick}
          />
        </Form.Item>
        <Space size={16} direction="vertical">
          <div className={styles['login-form-password-actions']}>
            <Checkbox checked={rememberAccount} onChange={setRememberAccount}>
              {t['login.form.rememberAccount']}
            </Checkbox>
          </div>
          <Button
            className={styles['login-submit-button']}
            type="primary"
            long
            onClick={onSubmitClick}
            loading={loading}
          >
            {t['login.form.login']}
          </Button>
          <div className={styles['login-form-note']}>
            {t['login.form.securityNote']}
          </div>
        </Space>
      </Form>
    </div>
  );
}
