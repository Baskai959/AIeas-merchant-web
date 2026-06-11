import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Grid,
  Message,
  Modal,
  Space,
  Typography,
} from '@arco-design/web-react';
import { useHistory, useParams } from 'react-router-dom';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import SafeImage from '@/components/SafeImage';
import { AuctionLot, fetchAuction } from '@/services/auctions';
import {
  attachAuctionToLiveSession,
  detachAuctionFromLiveSession,
} from '@/services/liveSession';
import {
  buildIdempotencyKey,
  canAttachAuctionToLiveSession,
  canDetachAuctionFromLiveSession,
  canEditAuctionRules,
  formatAuctionCategory,
  formatCapPrice,
  formatDateTime,
  formatMoneyCent,
  renderAuctionStatusTag,
  renderIncrementRule,
  renderReadonlyReason,
} from './utils';
import styles from '../management.module.less';

const Row = Grid.Row;
const Col = Grid.Col;

export default function AuctionDetailPage() {
  const history = useHistory();
  const { id } = useParams() as { id?: string };
  const [auction, setAuction] = useState<AuctionLot>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [attachLoading, setAttachLoading] = useState(false);

  async function loadAuctionDetail() {
    if (!id) {
      setLoadError('缺少拍品参数，无法查看详情。');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const result = await fetchAuction(id);
      setAuction(result);
    } catch (error) {
      setLoadError('拍品详情加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAuctionDetail();
  }, [id]);

  async function handleAttach() {
    if (!auction) {
      return;
    }
    if (!canAttachAuctionToLiveSession(auction.status)) {
      Message.warning('当前拍品状态不支持上架到直播场次');
      return;
    }
    if (!auction.liveSessionId) {
      Message.warning('请先进入直播场次控制台挂载拍品');
      return;
    }
    setAttachLoading(true);
    try {
      await attachAuctionToLiveSession(
        auction.liveSessionId,
        auction.auctionId,
        buildIdempotencyKey('live-session-attach', auction.auctionId)
      );
      Message.success('已上架到直播场次');
      loadAuctionDetail();
    } catch (error) {
      // 已提示
    } finally {
      setAttachLoading(false);
    }
  }

  async function handleDetach() {
    const liveSessionId = auction?.liveSessionId;
    if (!auction || !liveSessionId) return;
    if (!canDetachAuctionFromLiveSession(auction.status)) {
      Message.warning('已成交拍品已计入直播交易，不能下架。');
      return;
    }
    Modal.confirm({
      title: '下架拍品',
      content: '确定将该拍品从直播场次下架吗？',
      okText: '下架',
      cancelText: '取消',
      onOk: async () => {
        try {
          await detachAuctionFromLiveSession(
            liveSessionId,
            auction.auctionId,
            buildIdempotencyKey(
              'live-session-detach',
              `${liveSessionId}-${auction.auctionId}`
            )
          );
          Message.success('已从直播场次下架');
          loadAuctionDetail();
        } catch (error) {
          // 已提示
        }
      },
    });
  }

  return (
    <AppPage
      title="拍品详情"
      extra={
        <Space>
          <Button onClick={() => history.push('/auctions/list')}>
            返回列表
          </Button>
          {auction?.liveSessionId ? (
            <Button
              onClick={() =>
                history.push(
                  `/live-sessions/${auction.liveSessionId}/workbench`
                )
              }
            >
              进入工作台
            </Button>
          ) : null}
          {auction && canEditAuctionRules(auction.status) ? (
            <Button
              type="primary"
              onClick={() =>
                history.push(`/auctions/${auction.auctionId}/edit`)
              }
            >
              编辑规则
            </Button>
          ) : null}
        </Space>
      }
    >
      {loadError ? (
        <Card>
          <AppState
            status="500"
            title="拍品详情加载失败"
            subtitle={loadError}
            actionText="返回列表"
            onAction={() => history.push('/auctions/list')}
          />
        </Card>
      ) : (
        <>
          {auction ? (
            <Card className={styles.heroCard}>
              <div className={styles.heroBody}>
                <SafeImage
                  src={auction.coverUrl || auction.imageUrls?.[0]}
                  alt={auction.title || '拍品'}
                  className={styles.heroImage}
                />
                <div className={styles.heroMain}>
                  <h1 className={styles.heroTitle}>
                    {auction.title || '未命名拍品'}
                  </h1>
                  <div className={styles.heroMeta}>
                    {renderAuctionStatusTag(auction.status)}
                    <Typography.Text type="secondary">
                      {formatAuctionCategory(auction.category) || '未分类'}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      {auction.brand || '未填写品牌'}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      {auction.liveSessionId
                        ? '已上架直播场次'
                        : '未上架直播场次'}
                    </Typography.Text>
                  </div>
                  {auction.subtitle ? (
                    <Typography.Paragraph style={{ marginBottom: 8 }}>
                      {auction.subtitle}
                    </Typography.Paragraph>
                  ) : null}
                  <Typography.Paragraph style={{ marginBottom: 14 }}>
                    {auction.description || '暂无拍品描述'}
                  </Typography.Paragraph>
                  {auction.status === 'AUDIT_REJECTED' &&
                  auction.auditRejectReason ? (
                    <Alert
                      type="error"
                      content={`审核未通过：${auction.auditRejectReason}`}
                      style={{ marginBottom: 14 }}
                    />
                  ) : null}
                  <Space>
                    {auction.liveSessionId ? (
                      <>
                        <Button
                          onClick={() =>
                            history.push(
                              `/live-sessions/${auction.liveSessionId}/workbench`
                            )
                          }
                        >
                          进入工作台
                        </Button>
                        {canDetachAuctionFromLiveSession(auction.status) ? (
                          <Button onClick={handleDetach}>下架</Button>
                        ) : null}
                      </>
                    ) : (
                      <Button
                        type="primary"
                        disabled={!canAttachAuctionToLiveSession(auction.status)}
                        loading={attachLoading}
                        onClick={handleAttach}
                      >
                        上架到直播场次
                      </Button>
                    )}
                  </Space>
                </div>
              </div>
            </Card>
          ) : null}
          <Row gutter={16}>
            <Col span={16}>
              <Card loading={loading} title="拍卖信息">
                {auction ? (
                  <Descriptions
                    column={2}
                    data={[
                      {
                        label: '状态',
                        value: renderAuctionStatusTag(auction.status),
                      },
                      {
                        label: '起拍价',
                        value: formatMoneyCent(auction.startPrice),
                      },
                      {
                        label: '保留价',
                        value: formatMoneyCent(auction.reservePrice),
                      },
                      {
                        label: '封顶价',
                        value: formatCapPrice(auction.capPrice),
                      },
                      {
                        label: '保证金',
                        value: formatMoneyCent(auction.depositAmount),
                      },
                      {
                        label: '创建时间',
                        value: formatDateTime(auction.createdAt),
                      },
                      {
                        label: '更新时间',
                        value: formatDateTime(auction.updatedAt),
                      },
                    ]}
                  />
                ) : null}
              </Card>

              <Card
                loading={loading}
                title="规则配置"
                style={{ marginTop: 16 }}
              >
                {auction ? (
                  <Descriptions
                    column={1}
                    data={[
                      {
                        label: '加价规则',
                        value: renderIncrementRule(auction.incrementRule),
                      },
                      {
                        label: '防抢拍触发窗口',
                        value: `${auction.antiSnipingSec} 秒`,
                      },
                      {
                        label: '防抢拍延长时长',
                        value: `${auction.antiExtendSec} 秒`,
                      },
                    ]}
                  />
                ) : null}
              </Card>
            </Col>
            <Col span={8}>
              <Card loading={loading} title="运营状态">
                {auction ? (
                  <Space
                    direction="vertical"
                    size={12}
                    style={{ width: '100%' }}
                  >
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                      当前状态：{renderAuctionStatusTag(auction.status)}
                    </Typography.Paragraph>
                    {auction.status === 'AUDIT_REJECTED' &&
                    auction.auditRejectReason ? (
                      <Typography.Text type="secondary">
                        审核失败原因：{auction.auditRejectReason}
                      </Typography.Text>
                    ) : null}
                    {canEditAuctionRules(auction.status) ? (
                      <Typography.Text type="secondary">
                        当前拍品尚未正式开拍，可调整价格、保证金和加价规则。
                      </Typography.Text>
                    ) : (
                      renderReadonlyReason(auction.status)
                    )}
                  </Space>
                ) : null}
              </Card>

              <Card
                loading={loading}
                title="成交信息"
                style={{ marginTop: 16 }}
              >
                {auction ? (
                  <Descriptions
                    column={1}
                    data={[
                      {
                        label: '出价次数',
                        value:
                          typeof auction.bidCount === 'number'
                            ? `${auction.bidCount} 次`
                            : '-',
                      },
                      {
                        label: '当前价',
                        value: formatMoneyCent(
                          auction.currentPrice ?? auction.dealPrice
                        ),
                      },
                      {
                        label: '中拍结果',
                        value: auction.winnerId ? '已产生' : '-',
                      },
                      {
                        label: '成交价',
                        value: formatMoneyCent(auction.dealPrice),
                      },
                      {
                        label: '结拍时间',
                        value: formatDateTime(auction.closedAt),
                      },
                    ]}
                  />
                ) : null}
              </Card>
            </Col>
          </Row>
        </>
      )}
    </AppPage>
  );
}
