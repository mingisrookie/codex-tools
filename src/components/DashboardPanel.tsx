import type {
  ApiProxyDashboardSnapshot,
  ApiProxyStatus,
  DashboardDimensionStat,
  DashboardMetricEvent,
  DashboardTimelineBucket,
  DashboardWindowStats,
  RuntimeDataInfo,
} from "../types/app";
import { useState } from "react";
import { formatTokenCount } from "../utils/usage";

type DashboardPanelProps = {
  status: ApiProxyStatus;
  dashboard: ApiProxyDashboardSnapshot | null;
  runtimeDataInfo: RuntimeDataInfo;
  onRefresh: () => void;
};

function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)}s`;
  }
  return `${value}ms`;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <article className={`dashboardStatCard${tone ? ` ${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function DimensionList({ title, items }: { title: string; items: DashboardDimensionStat[] }) {
  return (
    <section className="dashboardMiniCard">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="dashboardMuted">暂无数据</p>
      ) : (
        <div className="dashboardRankList">
          {items.slice(0, 6).map((item) => (
            <div key={item.label} className="dashboardRankRow">
              <span>{item.label}</span>
              <strong>{item.requestCount}</strong>
              <small>{formatTokenCount(item.totalTokens)}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EventTable({
  title,
  events,
  empty,
}: {
  title: string;
  events: DashboardMetricEvent[];
  empty: string;
}) {
  return (
    <section className="dashboardSectionCard">
      <div className="dashboardSectionHeader">
        <h3>{title}</h3>
      </div>
      {events.length === 0 ? (
        <p className="dashboardMuted">{empty}</p>
      ) : (
        <div className="dashboardTableWrap">
          <table className="dashboardTable">
            <thead>
              <tr>
                <th>时间</th>
                <th>端点</th>
                <th>模型</th>
                <th>账号</th>
                <th>状态</th>
                <th>总耗时</th>
                <th>首字节</th>
                <th>Token</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event, index) => (
                <tr key={`${event.finishedAt}-${event.endpoint}-${index}`}>
                  <td>{new Date(event.finishedAt * 1000).toLocaleTimeString()}</td>
                  <td>{event.endpoint}</td>
                  <td>{event.model ?? "--"}</td>
                  <td>{event.accountLabel ?? "--"}</td>
                  <td>{event.statusCode ?? event.errorKind ?? "--"}</td>
                  <td>{formatMs(event.totalMs)}</td>
                  <td>{formatMs(event.firstChunkMs)}</td>
                  <td>{formatTokenCount(event.tokens.totalTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function WindowSummary({ stats }: { stats: DashboardWindowStats }) {
  return (
    <div className="dashboardStatsGrid">
      <StatCard label="请求数" value={String(stats.requestCount)} />
      <StatCard label="首字时间" value={formatMs(stats.latency.firstChunkP95Ms)} />
      <StatCard label="总用时" value={formatMs(stats.latency.totalP95Ms)} />
      <StatCard
        label="失败率"
        value={formatPercent(stats.failureRate)}
        tone={stats.failureCount > 0 ? "isDanger" : undefined}
      />
      <StatCard label="缓存命中" value={formatPercent(stats.cacheHitRate)} />
      <StatCard label="总 Token" value={formatTokenCount(stats.tokens.totalTokens)} />
    </div>
  );
}

function TimelineChart({
  title,
  stats,
}: {
  title: string;
  stats: DashboardWindowStats;
}) {
  const maxRequests = Math.max(1, ...stats.timeline.map((bucket) => bucket.requestCount));
  const maxLatency = Math.max(1, ...stats.timeline.map((bucket) => bucket.totalP95Ms ?? 0));
  const ticks = [maxLatency, Math.round(maxLatency / 2), 0];
  const points = stats.timeline
    .map((bucket, index) => {
      const x = stats.timeline.length <= 1 ? 0 : (index / (stats.timeline.length - 1)) * 100;
      const latency = bucket.totalP95Ms ?? 0;
      const y = 100 - (latency / maxLatency) * 100;
      return `${x.toFixed(2)},${Math.max(6, Math.min(96, y)).toFixed(2)}`;
    })
    .join(" ");

  return (
    <section className="dashboardSectionCard dashboardChartCard">
      <div className="dashboardSectionHeader">
        <div>
          <h3>{title}</h3>
          <p>柱状图是请求量，红色为失败占比，折线是总用时；左侧刻度是秒。</p>
        </div>
        <span>{stats.timeline.length} 个时间段</span>
      </div>
      <div className="dashboardChart">
        <div className="dashboardYAxis">
          {ticks.map((tick) => (
            <span key={tick}>{formatMs(tick)}</span>
          ))}
        </div>
        <svg className="dashboardLine" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline points={points} />
        </svg>
        <div className="dashboardBars">
          {stats.timeline.map((bucket) => (
            <TimelineBar
              key={bucket.startAt}
              bucket={bucket}
              maxRequests={maxRequests}
            />
          ))}
        </div>
      </div>
      <div className="dashboardChartLegend">
        <span><i className="legendBar" />请求量</span>
        <span><i className="legendFail" />失败</span>
        <span><i className="legendLine" />总用时</span>
      </div>
    </section>
  );
}

function TimelineBar({
  bucket,
  maxRequests,
}: {
  bucket: DashboardTimelineBucket;
  maxRequests: number;
}) {
  const height = Math.max(4, (bucket.requestCount / maxRequests) * 100);
  const failurePercent =
    bucket.requestCount === 0 ? 0 : (bucket.failureCount / bucket.requestCount) * 100;
  const title = [
    new Date(bucket.startAt * 1000).toLocaleString(),
    `请求: ${bucket.requestCount}`,
    `失败: ${bucket.failureCount}`,
    `总用时: ${formatMs(bucket.totalP95Ms)}`,
    `首字时间: ${formatMs(bucket.firstChunkP95Ms)}`,
    `Token: ${formatTokenCount(bucket.totalTokens)}`,
  ].join("\n");

  return (
    <div className="dashboardBarSlot" title={title}>
      <div className="dashboardBar" style={{ height: `${height}%` }}>
        {failurePercent > 0 ? (
          <span
            className="dashboardBarFailure"
            style={{ height: `${Math.max(8, failurePercent)}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

export function DashboardPanel({
  status,
  dashboard,
  runtimeDataInfo,
  onRefresh,
}: DashboardPanelProps) {
  const active = dashboard?.last10m;
  const [selectedWindow, setSelectedWindow] = useState<"10m" | "1h" | "24h">("10m");
  const selectedStats =
    selectedWindow === "10m"
      ? dashboard?.last10m
      : selectedWindow === "1h"
        ? dashboard?.last1h
        : dashboard?.last24h;

  return (
    <section className="dashboardPage">
      <div className="dashboardShell">
        <section className="dashboardHero">
          <div>
            <p className="sectionKicker">Codex Proxy Dashboard</p>
            <h2>8666 仪表盘</h2>
            <p>
              这里只统计 Codex Tools 自己的 8666 代理；如果 3000 failover 到外部链路，
              不会计入这里。
            </p>
          </div>
          <div className="dashboardHeroActions">
            <button className="ghost" onClick={onRefresh}>
              刷新
            </button>
            <span className={`proxyStatusDot${status.running ? " isRunning" : ""}`} />
            <strong>{status.running ? "运行中" : "未启动"}</strong>
          </div>
        </section>

        <section className="dashboardSectionCard">
          <div className="dashboardSectionHeader">
            <div>
              <h3>当前概览</h3>
              <p>首字时间=从请求进入 8666 到上游第一段内容回来；总用时=整次请求完成。</p>
            </div>
            <span>{dashboard ? new Date(dashboard.updatedAt * 1000).toLocaleString() : "未加载"}</span>
          </div>
          {active ? <WindowSummary stats={active} /> : <p className="dashboardMuted">暂无数据</p>}
        </section>

        {dashboard ? (
          <>
            <section className="dashboardSectionCard">
              <div className="dashboardSectionHeader">
                <div>
                  <h3>时间趋势</h3>
                  <p>切换时间窗口后，柱状图会随窗口重新分桶。</p>
                </div>
                <div className="dashboardSegmented">
                  {(["10m", "1h", "24h"] as const).map((window) => (
                    <button
                      key={window}
                      className={selectedWindow === window ? "isActive" : ""}
                      onClick={() => setSelectedWindow(window)}
                    >
                      {window}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {selectedStats ? (
              <TimelineChart title={`${selectedWindow} 请求趋势`} stats={selectedStats} />
            ) : null}

            <section className="dashboardSectionCard">
              <div className="dashboardSectionHeader">
                <h3>窗口对比</h3>
              </div>
              <div className="dashboardWindowGrid">
                <StatCard label="1h 请求 / 失败" value={`${dashboard.last1h.requestCount} / ${dashboard.last1h.failureCount}`} />
                <StatCard label="1h Token" value={formatTokenCount(dashboard.last1h.tokens.totalTokens)} />
                <StatCard label="24h 请求 / 失败" value={`${dashboard.last24h.requestCount} / ${dashboard.last24h.failureCount}`} />
                <StatCard label="24h Token" value={formatTokenCount(dashboard.last24h.tokens.totalTokens)} />
              </div>
            </section>

            <section className="dashboardColumns">
              <DimensionList title="模型排行" items={dashboard.last24h.topModels} />
              <DimensionList title="账号排行" items={dashboard.last24h.topAccounts} />
              <DimensionList title="端点排行" items={dashboard.last24h.topEndpoints} />
            </section>

            <section className="dashboardSectionCard">
              <div className="dashboardSectionHeader">
                <h3>进行中请求</h3>
              </div>
              {dashboard.inFlight.length === 0 ? (
                <p className="dashboardMuted">当前没有进行中的 8666 请求。</p>
              ) : (
                <div className="dashboardTableWrap">
                  <table className="dashboardTable">
                    <thead>
                      <tr>
                        <th>端点</th>
                        <th>模型</th>
                        <th>账号</th>
                        <th>阶段</th>
                        <th>已耗时</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.inFlight.map((request) => (
                        <tr key={request.id}>
                          <td>{request.endpoint}</td>
                          <td>{request.model ?? "--"}</td>
                          <td>{request.accountLabel ?? "--"}</td>
                          <td>{request.phase}</td>
                          <td>{formatMs(request.elapsedMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <EventTable
              title="最近慢请求"
              events={dashboard.recentSlowRequests}
              empty="没有超过阈值的慢请求。"
            />
            <EventTable
              title="最近失败"
              events={dashboard.recentFailures}
              empty="没有失败请求。"
            />
          </>
        ) : null}

        <section className="dashboardSectionCard">
          <div className="dashboardSectionHeader">
            <h3>数据文件</h3>
          </div>
          <div className="dashboardPathGrid">
            <div>
              <span>当前数据目录</span>
              <strong>{runtimeDataInfo.dataDir || dashboard?.dataDir || "--"}</strong>
            </div>
            <div>
              <span>指标文件</span>
              <strong>{dashboard?.metricsPath ?? "--"}</strong>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
