import type {
  ApiProxyDashboardSnapshot,
  ApiProxyStatus,
  DashboardDimensionStat,
  DashboardInFlightRequest,
  DashboardMetricEvent,
  DashboardWindowStats,
  RuntimeDataInfo,
} from "../types/app";
import { useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { MessageCatalog } from "../i18n/catalog";
import { buildTimelineChart } from "../utils/dashboardAxis";
import { formatTokenCount } from "../utils/usage";

type DashboardCopy = MessageCatalog["dashboard"];

type DashboardFilters = {
  endpoint: string;
  model: string;
  account: string;
};

const ALL_FILTER_VALUE = "__all__";

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
  return `${value}ms`;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }
  return new Intl.NumberFormat().format(value);
}

function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }
  if (value < 1024) {
    return `${value}B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)}KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}

function formatStreamMode(value: boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "--";
  }
  return value ? "流式" : "非流式";
}

function formatWindowLabel(window: "10m" | "1h" | "24h"): string {
  return window === "10m" ? "最近 10 分钟" : window === "1h" ? "最近 1 小时" : "最近 24 小时";
}

function formatUpdatedAt(dashboard: ApiProxyDashboardSnapshot | null): string {
  return dashboard ? new Date(dashboard.updatedAt * 1000).toLocaleString() : "等待载入";
}

function formatCachePair(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }
  return `${formatPercent(value)} / ${formatPercent(1 - value)}`;
}

function formatEventTime(value: number): string {
  return new Date(value * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function resolveActiveAccount(status: ApiProxyStatus): string {
  return maskSensitiveAccountLabel(status.activeAccountLabel ?? status.activeAccountKey ?? status.activeAccountId) ?? "--";
}

function maskSensitiveAccountLabel(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const compact = value.split(/\s+/).join(" ").trim();
  if (!compact) {
    return null;
  }
  const [name, domain] = compact.split("@");
  if (domain) {
    return `${name.charAt(0) || "*"}***@${domain}`;
  }
  if (compact.length > 12) {
    return `${compact.slice(0, 4)}***${compact.slice(-4)}`;
  }
  return compact;
}

function formatRequestPhase(phase: string): string {
  const phaseLabels: Record<string, string> = {
    request_received: "已收到请求",
    normalized: "请求已标准化",
    normalize_failed: "请求标准化失败",
    auth_failed: "认证失败",
    parse_failed: "解析失败",
    upstream_request_start: "请求上游中",
    upstream_headers_received: "已收到上游响应头",
    upstream_request_failed: "上游请求失败",
    non_stream_body_read_start: "读取非流式响应",
    non_stream_body_read_failed: "读取非流式响应失败",
    non_stream_body_read_finished: "非流式响应读取完成",
    non_stream_extract_failed: "提取非流式响应失败",
    non_stream_serialize_failed: "序列化非流式响应失败",
    non_stream_response_ready: "非流式响应已就绪",
    downstream_stream_start: "下游流式传输中",
    first_upstream_chunk: "已收到首段响应",
    sse_progress: "流式响应进行中",
    sse_terminal_event: "流式响应结束事件",
    upstream_response_failed: "上游响应失败",
    upstream_response_incomplete: "上游响应不完整",
    upstream_stream_error: "上游流错误",
    upstream_stream_end: "上游流结束",
    client_disconnected: "客户端已断开",
    client_disconnected_after_first_chunk: "客户端首段后断开",
  };
  return phaseLabels[phase] ?? "未知阶段";
}

function formatEventStatus(event: DashboardMetricEvent): string {
  return String(event.statusCode ?? event.errorKind ?? "--");
}

function formatEventErrorDetails(event: DashboardMetricEvent): string {
  const parts: string[] = [];
  if (event.statusCode && event.statusCode >= 400) {
    parts.push(`HTTP ${event.statusCode}`);
  }
  if (event.errorKind) {
    parts.push(event.errorKind);
  }
  if (event.failureCategory) {
    parts.push(event.failureCategory);
  }
  if (event.failureBrief) {
    parts.push(event.failureBrief);
  }
  return parts.join(" · ");
}

function formatRouteExplanation(event: DashboardMetricEvent, copy: DashboardCopy): string {
  const route = event.routeExplanation;
  if (!route) {
    return "--";
  }
  const parts = [
    copy.routeStrategy(route.strategy || "--"),
    copy.routeCandidates(route.availableCandidateCount, route.initialCandidateCount),
  ];
  if (route.selectedAccountLabel) {
    parts.push(copy.routeSelected(maskSensitiveAccountLabel(route.selectedAccountLabel) ?? route.selectedAccountLabel));
  }
  if (route.selectedAccountId) {
    parts.push(copy.routeSelectedId(route.selectedAccountId));
  }
  if (route.requestedAccountMatched) {
    parts.push(copy.routeRequestedAccount);
  }
  if (route.affinityMatched) {
    parts.push(copy.routeAffinityMatched);
  } else if (route.affinityKeyPresent) {
    parts.push(copy.routeAffinitySkipped(route.affinitySkippedReason ?? copy.routeAffinityMiss));
  }
  if (route.excludedByAuth > 0) {
    parts.push(copy.routeExcludedAuth(route.excludedByAuth));
  }
  if (route.excludedByUsage > 0) {
    parts.push(copy.routeExcludedUsage(route.excludedByUsage));
  }
  if (route.cooldownApplied) {
    parts.push(copy.routeCooldown(route.excludedByCooldown));
  }
  if (route.latencyPreferred) {
    parts.push(copy.routeLatencyPreferred);
  }
  return parts.join(" · ");
}

function uniqueFilterValues(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeAccountFilterValue(value: string | null | undefined): string | null {
  return maskSensitiveAccountLabel(value);
}

function eventAccountLabel(event: DashboardMetricEvent): string | null {
  return event.accountLabel ?? event.routeExplanation?.selectedAccountLabel ?? null;
}

function filterEvents(events: DashboardMetricEvent[], filters: DashboardFilters): DashboardMetricEvent[] {
  return events.filter((event) => {
    const endpointMatched = filters.endpoint === ALL_FILTER_VALUE || event.endpoint === filters.endpoint;
    const modelMatched = filters.model === ALL_FILTER_VALUE || (event.model ?? "") === filters.model;
    const accountMatched =
      filters.account === ALL_FILTER_VALUE ||
      (normalizeAccountFilterValue(eventAccountLabel(event)) ?? "") === filters.account;
    return endpointMatched && modelMatched && accountMatched;
  });
}

function DashboardMetaItem({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`dashboardMetaItem${wide ? " isWide" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: string; title: string; description?: string }) {
  return (
    <div className="dashboardEmptyState">
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <article className={`dashboardStatCard${tone ? ` ${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

function DashboardStats({ dashboard }: { dashboard: ApiProxyDashboardSnapshot | null }) {
  const last24h = dashboard?.last24h;
  const cacheHitRate = last24h?.cacheHitRate;
  const cacheMissRate = cacheHitRate === null || cacheHitRate === undefined ? null : 1 - cacheHitRate;

  return (
    <div className="dashboardStatsGrid">
      <StatCard
        label="最近 10 分钟请求数"
        value={formatCount(dashboard?.last10m.requestCount)}
        hint="完成请求"
        tone="isAccent"
      />
      <StatCard
        label="最近 1 小时请求数"
        value={formatCount(dashboard?.last1h.requestCount)}
        hint="完成请求"
      />
      <StatCard
        label="24 小时请求数"
        value={formatCount(last24h?.requestCount)}
        hint="完成请求"
      />
      <StatCard
        label="失败率"
        value={formatPercent(last24h?.failureRate)}
        hint={`${formatCount(last24h?.failureCount)} 次失败 / 24 小时`}
        tone={(last24h?.failureCount ?? 0) > 0 ? "isDanger" : undefined}
      />
      <StatCard
        label="P95 延迟"
        value={formatMs(last24h?.latency.totalP95Ms)}
        hint="24 小时总用时"
        tone="isLatency"
      />
      <StatCard
        label="令牌总量"
        value={last24h ? formatTokenCount(last24h.tokens.totalTokens) : "--"}
        hint="24 小时输入 + 输出"
        tone="isWarm"
      />
      <StatCard
        label="缓存命中 / 未命中"
        value={formatCachePair(cacheHitRate)}
        hint={cacheMissRate === null ? "等待缓存统计" : `未命中 ${formatPercent(cacheMissRate)}`}
      />
      <StatCard
        label="进行中请求数"
        value={formatCount(dashboard?.inFlight.length)}
        hint="当前活跃请求"
      />
    </div>
  );
}

function DimensionList({ title, items }: { title: string; items: DashboardDimensionStat[] }) {
  const maxRequests = Math.max(1, ...items.map((item) => item.requestCount));

  return (
    <section className="dashboardMiniCard">
      <div className="dashboardMiniHeader">
        <h4>{title}</h4>
        <span>24 小时</span>
      </div>
      {items.length === 0 ? (
        <EmptyState icon="○" title="暂无排行数据" description="有请求后会在这里显示前 6 项。" />
      ) : (
        <div className="dashboardRankList">
          {items.slice(0, 6).map((item) => {
            const progress = Math.max(3, (item.requestCount / maxRequests) * 100);
            return (
              <div key={item.label} className="dashboardRankRow">
                <div className="dashboardRankRowTop">
                  <span title={item.label}>{item.label}</span>
                  <strong>{formatCount(item.requestCount)}</strong>
                </div>
                <div className="dashboardRankTrack" aria-hidden="true">
                  <i style={{ width: `${progress}%` }} />
                </div>
                <div className="dashboardRankMeta">
                  <small>{formatTokenCount(item.totalTokens)} 令牌</small>
                  <small>{item.failureCount > 0 ? `${item.failureCount} 失败` : "无失败"}</small>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function EventTable({
  title,
  events,
  empty,
  copy,
}: {
  title: string;
  events: DashboardMetricEvent[];
  empty: string;
  copy: DashboardCopy;
}) {
  return (
    <section className="dashboardSectionCard dashboardRequestsCard">
      <div className="dashboardSectionHeader">
        <div>
          <h3>{title}</h3>
          <p>{copy.eventsDescription}</p>
        </div>
      </div>
      {events.length === 0 ? (
        <EmptyState icon="□" title={empty} description={copy.eventsEmptyDescription} />
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
                <th>请求大小</th>
                <th>流式</th>
                <th>总耗时</th>
                <th>首字节</th>
                <th>{copy.routeColumn}</th>
                <th>{copy.errorDetailsColumn}</th>
                <th>令牌</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event, index) => {
                const errorDetails = formatEventErrorDetails(event);
                const routeExplanation = formatRouteExplanation(event, copy);
                const accountLabel = maskSensitiveAccountLabel(eventAccountLabel(event)) ?? "--";
                return (
                  <tr key={`${event.finishedAt}-${event.endpoint}-${index}`}>
                    <td>{formatEventTime(event.finishedAt)}</td>
                    <td title={event.endpoint}>{event.endpoint}</td>
                    <td title={event.model ?? ""}>{event.model ?? "--"}</td>
                    <td title={accountLabel}>{accountLabel}</td>
                    <td>{formatEventStatus(event)}</td>
                    <td>{formatBytes(event.requestBytes)}</td>
                    <td>{formatStreamMode(event.downstreamStream)}</td>
                    <td>{formatMs(event.totalMs)}</td>
                    <td>{formatMs(event.firstChunkMs)}</td>
                    <td className="dashboardRouteCell" title={routeExplanation}>
                      {routeExplanation}
                    </td>
                    <td className="dashboardErrorCell" title={errorDetails}>
                      {errorDetails || "--"}
                    </td>
                    <td>{formatTokenCount(event.tokens.totalTokens)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FailureDiagnostics({ events, copy }: { events: DashboardMetricEvent[]; copy: DashboardCopy }) {
  return (
    <section className="dashboardSectionCard dashboardDiagnosticCard">
      <div className="dashboardSectionHeader">
        <div>
          <h3>最近失败</h3>
          <p>{copy.failuresDescription}</p>
        </div>
      </div>
      {events.length === 0 ? (
        <EmptyState icon="✓" title={copy.noFailuresTitle} description={copy.noFailuresDescription} />
      ) : (
        <div className="dashboardDiagnosticList">
          {events.map((event, index) => {
            const errorDetails = formatEventErrorDetails(event);
            const routeExplanation = formatRouteExplanation(event, copy);
            const accountLabel = maskSensitiveAccountLabel(event.accountLabel) ?? copy.unlabeledAccount;
            return (
              <article key={`${event.finishedAt}-${event.endpoint}-${index}`} className="dashboardDiagnosticItem isFailure">
                <div>
                  <strong title={event.endpoint}>{event.endpoint}</strong>
                  <span>{formatEventTime(event.finishedAt)} · {event.model ?? copy.unknownModel}</span>
                </div>
                <small title={formatEventStatus(event)}>
                  {formatEventStatus(event)}
                  {event.failureCategory ? ` · ${event.failureCategory}` : ""}
                </small>
                <p>
                  {accountLabel} · {copy.requestBytes(formatBytes(event.requestBytes))} ·{" "}
                  {formatStreamMode(event.downstreamStream)} · {copy.totalLatency(formatMs(event.totalMs))}
                </p>
                {errorDetails ? (
                  <pre className="dashboardErrorMessage">{errorDetails}</pre>
                ) : null}
                {routeExplanation !== "--" ? (
                  <pre className="dashboardRouteMessage">{routeExplanation}</pre>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function InFlightDiagnostics({ requests, copy }: { requests: DashboardInFlightRequest[]; copy: DashboardCopy }) {
  return (
    <section className="dashboardSectionCard dashboardDiagnosticCard">
      <div className="dashboardSectionHeader">
        <div>
          <h3>进行中请求</h3>
          <p>{copy.inFlightDescription}</p>
        </div>
      </div>
      {requests.length === 0 ? (
        <EmptyState icon="↻" title={copy.noInFlightTitle} description={copy.noInFlightDescription} />
      ) : (
        <div className="dashboardDiagnosticList">
          {requests.slice(0, 5).map((request) => (
            <article key={request.id} className="dashboardDiagnosticItem">
              <div>
                <strong title={request.endpoint}>{request.endpoint}</strong>
                <span>
                  {request.model ?? copy.unknownModel} ·{" "}
                  {maskSensitiveAccountLabel(request.accountLabel) ?? copy.unlabeledAccount}
                </span>
              </div>
              <small>{formatRequestPhase(request.phase)}</small>
              <p>{copy.elapsed(formatMs(request.elapsedMs))}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function TimelineChart({
  title,
  stats,
  actions,
}: {
  title: string;
  stats: DashboardWindowStats;
  actions?: ReactNode;
}) {
  const chart = buildTimelineChart(stats);
  const plot = {
    left: 82,
    right: 106,
    top: 36,
    bottom: 58,
    width: 792,
    height: 220,
  };
  const bucketCount = Math.max(1, stats.timeline.length);
  const slotWidth = plot.width / bucketCount;
  const barWidth = Math.max(8, Math.min(24, slotWidth * 0.52));
  const scaleX = (value: number) => plot.left + (value / 100) * plot.width;
  const scaleY = (value: number) => plot.top + (value / 100) * plot.height;
  const linePoints = chart.linePoints
    .split(" ")
    .filter(Boolean)
    .map((point) => {
      const [x = 0, y = 0] = point.split(",").map(Number);
      return `${scaleX(x).toFixed(2)},${scaleY(y).toFixed(2)}`;
    })
    .join(" ");
  const hasTraffic = stats.requestCount > 0 && stats.timeline.length > 0;

  return (
    <section className="dashboardSectionCard dashboardChartCard">
      <div className="dashboardSectionHeader">
        <div>
          <h3>{title}</h3>
          <p>蓝色柱表示请求量，红色叠加表示失败请求，紫橙色折线表示 P95 总延迟。</p>
        </div>
        <div className="dashboardSectionActions">
          <span>{stats.timeline.length} 个时间段</span>
          {actions}
        </div>
      </div>
      <div className="dashboardChart" aria-label={`${title} 图表`}>
        {hasTraffic ? (
          <svg className="dashboardChartSvg" viewBox="0 0 1000 332" role="img">
            <defs>
              <linearGradient id="dashboardRequestBar" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--dashboard-bar-start)" />
                <stop offset="100%" stopColor="var(--dashboard-bar-end)" />
              </linearGradient>
            </defs>
            <text className="dashboardAxisTitle" x={plot.left} y={20}>
              {chart.requestAxisLabel}
            </text>
            <text className="dashboardAxisTitle dashboardAxisTitleLatency" x={plot.left + plot.width} y={20} textAnchor="end">
              {chart.latencyAxisLabel}
            </text>
            <rect
              className="dashboardPlotArea"
              x={plot.left}
              y={plot.top}
              width={plot.width}
              height={plot.height}
              rx="14"
            />
            {chart.requestGridLines.map((line) => {
              const y = scaleY(line.y);
              return (
                <g key={`request-${line.label}`}>
                  <line className="dashboardGridLine" x1={plot.left} x2={plot.left + plot.width} y1={y} y2={y} />
                  <text className="dashboardAxisText" x={plot.left - 14} y={y + 4} textAnchor="end">
                    {line.label}
                  </text>
                </g>
              );
            })}
            {chart.latencyTicks.map((tick) => {
              const y = scaleY(100 - (tick.value / chart.maxLatency) * 100);
              return (
                <text key={`latency-${tick.value}`} className="dashboardAxisText dashboardAxisTextLatency" x={plot.left + plot.width + 14} y={y + 4}>
                  {tick.label}
                </text>
              );
            })}
            {chart.bars.map((bar, index) => {
              const bucket = stats.timeline[index];
              const center = plot.left + index * slotWidth + slotWidth / 2;
              const barHeight = (bar.height / 100) * plot.height;
              const failHeight = (bar.failureHeight / 100) * barHeight;
              const y = plot.top + plot.height - barHeight;
              const x = center - barWidth / 2;
              const titleLines = [
                new Date(bucket.startAt * 1000).toLocaleString(),
                `请求: ${bucket.requestCount}`,
                `失败: ${bucket.failureCount}`,
                `P95 总延迟: ${formatMs(bucket.totalP95Ms)}`,
                `P95 首字节: ${formatMs(bucket.firstChunkP95Ms)}`,
                `令牌: ${formatTokenCount(bucket.totalTokens)}`,
              ];
              return (
                <g key={bucket.startAt}>
                  <title>{titleLines.join("\n")}</title>
                  <rect
                    className="dashboardSvgBar"
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={Math.min(8, barWidth / 2)}
                  />
                  {failHeight > 0 ? (
                    <rect
                      className="dashboardSvgBarFailure"
                      x={x}
                      y={plot.top + plot.height - failHeight}
                      width={barWidth}
                      height={failHeight}
                      rx={Math.min(7, barWidth / 2)}
                    />
                  ) : null}
                </g>
              );
            })}
            {linePoints ? <polyline className="dashboardSvgLine" points={linePoints} /> : null}
            {chart.linePoints
              .split(" ")
              .filter(Boolean)
              .map((point, index) => {
                const [x = 0, y = 0] = point.split(",").map(Number);
                return (
                  <circle
                    key={`${point}-${index}`}
                    className="dashboardSvgLinePoint"
                    cx={scaleX(x)}
                    cy={scaleY(y)}
                    r="3.4"
                  />
                );
              })}
            <line className="dashboardAxisLine" x1={plot.left} x2={plot.left + plot.width} y1={plot.top + plot.height} y2={plot.top + plot.height} />
            <line className="dashboardAxisLine" x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.top + plot.height} />
            <line className="dashboardAxisLine" x1={plot.left + plot.width} x2={plot.left + plot.width} y1={plot.top} y2={plot.top + plot.height} />
            {chart.timeLabels.map((label) => {
              const bucketIndex = label.bucketIndex;
              const x = plot.left + bucketIndex * slotWidth + slotWidth / 2;
              return (
                <g key={`${label.startAt}-${bucketIndex}`}>
                  <line className="dashboardTickLine" x1={x} x2={x} y1={plot.top + plot.height} y2={plot.top + plot.height + 7} />
                  <text className="dashboardAxisText" x={x} y={plot.top + plot.height + 27} textAnchor="middle">
                    {label.label}
                  </text>
                </g>
              );
            })}
            <text className="dashboardAxisTitle" x={plot.left + plot.width / 2} y={318} textAnchor="middle">
              时间
            </text>
          </svg>
        ) : (
          <EmptyState icon="▥" title="暂无趋势数据" description="收到请求后会显示请求量、失败叠加和 P95 延迟折线。" />
        )}
      </div>
      <div className="dashboardChartLegend">
        <span><i className="legendBar" />请求量</span>
        <span><i className="legendFail" />失败</span>
        <span><i className="legendLine" />P95 延迟</span>
      </div>
    </section>
  );
}

function DashboardFiltersBar({
  filters,
  endpointOptions,
  modelOptions,
  accountOptions,
  onChange,
  copy,
}: {
  filters: DashboardFilters;
  endpointOptions: string[];
  modelOptions: string[];
  accountOptions: string[];
  onChange: (next: DashboardFilters) => void;
  copy: DashboardCopy;
}) {
  const update = (patch: Partial<DashboardFilters>) => onChange({ ...filters, ...patch });
  const renderSelect = (
    label: string,
    value: string,
    options: string[],
    onSelect: (value: string) => void,
  ) => (
    <label className="dashboardFilterField">
      <span>{label}</span>
      <select value={value} onChange={(event) => onSelect(event.target.value)}>
        <option value={ALL_FILTER_VALUE}>{copy.filterAll}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section className="dashboardFilterBar" aria-label={copy.filtersAriaLabel}>
      <div>
        <strong>{copy.filtersTitle}</strong>
        <p>{copy.filtersDescription}</p>
      </div>
      <div className="dashboardFilterControls">
        {renderSelect(copy.filterEndpoint, filters.endpoint, endpointOptions, (endpoint) =>
          update({ endpoint }),
        )}
        {renderSelect(copy.filterModel, filters.model, modelOptions, (model) => update({ model }))}
        {renderSelect(copy.filterAccount, filters.account, accountOptions, (account) =>
          update({ account }),
        )}
      </div>
    </section>
  );
}

export function DashboardPanel({
  status,
  dashboard,
  runtimeDataInfo,
  onRefresh,
}: DashboardPanelProps) {
  const { copy } = useI18n();
  const dashboardCopy = copy.dashboard;
  const [selectedWindow, setSelectedWindow] = useState<"10m" | "1h" | "24h">("10m");
  const [filters, setFilters] = useState<DashboardFilters>({
    endpoint: ALL_FILTER_VALUE,
    model: ALL_FILTER_VALUE,
    account: ALL_FILTER_VALUE,
  });
  const selectedStats =
    selectedWindow === "10m"
      ? dashboard?.last10m
      : selectedWindow === "1h"
        ? dashboard?.last1h
        : dashboard?.last24h;
  const dataDir = runtimeDataInfo.dataDir || dashboard?.dataDir || "--";
  const metricsPath = dashboard?.metricsPath ?? "--";
  const dashboardEvents = useMemo(
    () => [...(dashboard?.recentRequests ?? []), ...(dashboard?.recentFailures ?? [])],
    [dashboard?.recentFailures, dashboard?.recentRequests],
  );
  const endpointOptions = useMemo(
    () => uniqueFilterValues(dashboardEvents.map((event) => event.endpoint)),
    [dashboardEvents],
  );
  const modelOptions = useMemo(
    () => uniqueFilterValues(dashboardEvents.map((event) => event.model)),
    [dashboardEvents],
  );
  const accountOptions = useMemo(
    () => uniqueFilterValues(dashboardEvents.map((event) => normalizeAccountFilterValue(eventAccountLabel(event)))),
    [dashboardEvents],
  );
  const filteredRecentRequests = useMemo(
    () => filterEvents(dashboard?.recentRequests ?? [], filters),
    [dashboard?.recentRequests, filters],
  );
  const filteredRecentFailures = useMemo(
    () => filterEvents(dashboard?.recentFailures ?? [], filters),
    [dashboard?.recentFailures, filters],
  );

  return (
    <section className="dashboardPage">
      <div className="dashboardShell">
        <section className="dashboardHero dashboardHeroPanel">
          <div className="dashboardHeroTop">
            <div className="dashboardTitleBlock">
              <p className="sectionKicker">Codex Tools</p>
              <h2>API Proxy 运行仪表盘</h2>
              <p>监控本地 OpenAI 兼容代理的请求、失败、延迟、令牌和实时排队状态。</p>
            </div>
            <div className="dashboardHeroActions">
              <span className={`dashboardStatusPill${status.running ? " isRunning" : ""}`}>
                <i className={`proxyStatusDot${status.running ? " isRunning" : ""}`} />
                {status.running ? "代理运行中" : "代理未启动"}
              </span>
              <button className="ghost" onClick={onRefresh}>
                刷新
              </button>
            </div>
          </div>

          <div className="dashboardHeaderMetaGrid">
            <DashboardMetaItem label="端口" value={status.port ? String(status.port) : "--"} />
            <DashboardMetaItem label="活跃账号" value={resolveActiveAccount(status)} />
            <DashboardMetaItem label="最后更新时间" value={formatUpdatedAt(dashboard)} />
            <DashboardMetaItem label="数据目录" value={dataDir} wide />
            <DashboardMetaItem label="指标文件路径" value={metricsPath} wide />
          </div>
        </section>

        <DashboardStats dashboard={dashboard} />

        <DashboardFiltersBar
          filters={filters}
          endpointOptions={endpointOptions}
          modelOptions={modelOptions}
          accountOptions={accountOptions}
          onChange={setFilters}
          copy={dashboardCopy}
        />

        {selectedStats ? (
          <TimelineChart
            title={`${formatWindowLabel(selectedWindow)} 请求趋势`}
            stats={selectedStats}
            actions={
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
            }
          />
        ) : (
          <section className="dashboardSectionCard dashboardChartCard">
            <div className="dashboardSectionHeader">
              <div>
                <h3>请求趋势</h3>
                <p>蓝色柱表示请求量，红色叠加表示失败请求，紫橙色折线表示 P95 总延迟。</p>
              </div>
            </div>
            <div className="dashboardChart">
              <EmptyState icon="▥" title="等待仪表盘数据" description="代理启动并产生指标后会自动显示趋势图。" />
            </div>
          </section>
        )}

        <section className="dashboardColumns">
          <DimensionList title="热门模型" items={dashboard?.last24h.topModels ?? []} />
          <DimensionList title="活跃账号排行" items={dashboard?.last24h.topAccounts ?? []} />
          <DimensionList title="热门接口" items={dashboard?.last24h.topEndpoints ?? []} />
        </section>

        <section className="dashboardBottomGrid">
          <EventTable
            title="最近请求"
            events={filteredRecentRequests}
            empty="还没有请求记录"
            copy={dashboardCopy}
          />
          <aside className="dashboardDiagnosticsStack">
            <FailureDiagnostics events={filteredRecentFailures} copy={dashboardCopy} />
            <InFlightDiagnostics requests={dashboard?.inFlight ?? []} copy={dashboardCopy} />
          </aside>
        </section>
      </div>
    </section>
  );
}
