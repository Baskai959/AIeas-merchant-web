import { Button, Result } from '@arco-design/web-react';

interface AppStateProps {
  status: '404' | '403' | '500' | 'empty';
  title: string;
  subtitle: string;
  actionText?: string;
  onAction?: () => void;
}

export default function AppState(props: AppStateProps) {
  const { status, title, subtitle, actionText, onAction } = props;
  const resultStatus: '404' | '403' | '500' | 'info' =
    status === 'empty' ? 'info' : status;

  return (
    <Result
      status={resultStatus}
      title={title}
      subTitle={subtitle}
      extra={
        actionText && onAction ? (
          <Button type="primary" onClick={onAction}>
            {actionText}
          </Button>
        ) : null
      }
    />
  );
}
