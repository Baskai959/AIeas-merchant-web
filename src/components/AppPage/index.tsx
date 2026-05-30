import React from 'react';
import { Space, Typography } from '@arco-design/web-react';

interface AppPageProps {
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}

export default function AppPage(props: AppPageProps) {
  const { title, extra, children } = props;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space
        align="center"
        wrap
        style={{ width: '100%', justifyContent: 'space-between' }}
      >
        <Typography.Title heading={5} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        {extra}
      </Space>
      {children}
    </Space>
  );
}
