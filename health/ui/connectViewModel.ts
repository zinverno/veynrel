import { dateLocale, t } from "../../i18n";
import type { ConnectResult, ConnectSnapshot } from "../connectPort";

export function connectResultMessage(result?: ConnectResult): string | undefined {
  return result && !result.ok ? t(`@connect.error.${result.reason}`) : undefined;
}

export function connectViewModel(snapshot: ConnectSnapshot) {
  const status = snapshot.busy ? t(snapshot.operation === "sync" ? "@connect.state.syncing"
    : snapshot.operation === "disable" ? "@connect.disabling" : "@connect.connecting") : t(`@connect.state.${snapshot.state}`);
  return {
    title: t("@connect.title"), status,
    endpointLabel: snapshot.endpointLabel,
    location: t(snapshot.local ? "@connect.local" : "@connect.remote"),
    mirror: t(snapshot.mirrorKnownReady ? "@connect.mirror-ready" : "@connect.mirror-unknown"),
    error: snapshot.error ? t(`@connect.error.${snapshot.error}`) : undefined,
    lastSuccess: snapshot.lastSuccessAt === undefined ? undefined
      : t("@connect.last-success", { time: new Date(snapshot.lastSuccessAt).toLocaleString(dateLocale()) }),
    configured: snapshot.enabled && snapshot.state !== "unconfigured",
  };
}
