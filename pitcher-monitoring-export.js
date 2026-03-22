const POSITION_EXPORT_META = {
  TEAM: {
    title: "Pitcher Monitoring",
    slug: "pitcher_monitoring",
  },
  SP: {
    title: "Starting Pitcher",
    slug: "starting_pitcher",
  },
  RP: {
    title: "Relief Pitcher",
    slug: "relief_pitcher",
  },
};

const TEMPLATE_VARIANT_FILE_SUFFIX = {
  classic: "",
  rp_premium: "_rp_premium",
  bullpen_alt: "_bullpen_alt",
  bullpen_classic: "_bullpen_classic",
};

export function getPitcherMonitoringExportMeta(positionFilter = "TEAM") {
  return POSITION_EXPORT_META[positionFilter] || POSITION_EXPORT_META.TEAM;
}

export function buildPitcherMonitoringFileName(
  positionFilter = "TEAM",
  gameDate = "unknown",
  templateVariant = "classic",
) {
  const { slug } = getPitcherMonitoringExportMeta(positionFilter);
  const safeDate = String(gameDate || "unknown").slice(0, 10);
  const suffix = TEMPLATE_VARIANT_FILE_SUFFIX[templateVariant] || "";
  return `${slug}${suffix}_${safeDate}.pdf`;
}
