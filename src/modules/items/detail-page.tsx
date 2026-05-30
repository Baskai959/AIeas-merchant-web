import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Grid,
  Space,
  Typography,
} from '@arco-design/web-react';
import { useHistory, useParams } from 'react-router-dom';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import SafeImage from '@/components/SafeImage';
import { fetchItem, Item } from '@/services/items';
import {
  formatDateTime,
  getItemConditionLabel,
  renderImageLinks,
  renderItemStatusTag,
} from './utils';
import styles from '../management.module.less';

const Row = Grid.Row;
const Col = Grid.Col;

export default function ItemDetailPage() {
  const history = useHistory();
  const { id } = useParams() as { id?: string };
  const [item, setItem] = useState<Item>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!id) {
      setLoadError('缺少商品参数，无法查看详情。');
      setLoading(false);
      return;
    }

    async function loadItemDetail() {
      setLoading(true);
      setLoadError('');
      try {
        const result = await fetchItem(id);
        setItem(result);
      } catch (error) {
        setLoadError('商品详情加载失败，请稍后重试。');
      } finally {
        setLoading(false);
      }
    }

    loadItemDetail();
  }, [id]);

  return (
    <AppPage
      title="商品详情"
      extra={
        <Space>
          <Button onClick={() => history.push('/items/list')}>返回列表</Button>
          {id ? (
            <Button type="primary" onClick={() => history.push(`/items/${id}/edit`)}>
              编辑商品
            </Button>
          ) : null}
        </Space>
      }
    >
      {loadError ? (
        <Card>
          <AppState
            status="500"
            title="商品详情加载失败"
            subtitle={loadError}
            actionText="返回列表"
            onAction={() => history.push('/items/list')}
          />
        </Card>
      ) : (
        <>
          <Card loading={loading} className={styles.heroCard}>
            {item ? (
              <div className={styles.heroBody}>
                <SafeImage
                  src={item.images?.[0]}
                  alt={item.title}
                  className={styles.heroImage}
                />
                <div className={styles.heroMain}>
                  <h1 className={styles.heroTitle}>{item.title}</h1>
                  <div className={styles.heroMeta}>
                    {renderItemStatusTag(item.status)}
                    <Typography.Text type="secondary">{item.category}</Typography.Text>
                    <Typography.Text type="secondary">
                      {item.brand || '未填写品牌'}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      {getItemConditionLabel(item.conditionGrade)}
                    </Typography.Text>
                  </div>
                  <Typography.Paragraph style={{ marginBottom: 0 }}>
                    {item.description || '暂无商品描述'}
                  </Typography.Paragraph>
                </div>
              </div>
            ) : null}
          </Card>
          <Row gutter={16}>
            <Col span={14}>
              <Card loading={loading} title="商品资料">
                {item ? (
                  <Descriptions
                    column={2}
                    data={[
                      { label: '类目', value: item.category },
                      { label: '品牌', value: item.brand || '-' },
                      {
                        label: '成色',
                        value: getItemConditionLabel(item.conditionGrade),
                      },
                      { label: '状态', value: renderItemStatusTag(item.status) },
                      { label: '创建时间', value: formatDateTime(item.createdAt) },
                      { label: '更新时间', value: formatDateTime(item.updatedAt) },
                      { label: '图片资源', value: renderImageLinks(item.images) },
                    ]}
                  />
                ) : null}
              </Card>
            </Col>
            <Col span={10}>
              <Card loading={loading} title="商品图片">
                {item?.images?.length ? (
                  <div className={styles.imageGrid}>
                    {item.images.map((image) => (
                      <SafeImage
                        key={image}
                        src={image}
                        alt={item.title}
                        className={styles.galleryImage}
                      />
                    ))}
                  </div>
                ) : (
                  <Typography.Text type="secondary">暂未上传图片</Typography.Text>
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}
    </AppPage>
  );
}
