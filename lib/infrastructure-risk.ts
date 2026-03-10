import { SupabaseClient } from "@supabase/supabase-js";
import type { DbIssue, DbInfrastructureRiskZone } from "@/types/database";

const EARTH_RADIUS_KM = 6371;

/**
 * Calculate distance between two coordinates in meters
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c * 1000; // Convert to meters
}

/**
 * Detect and update infrastructure risk zones based on complaint patterns
 */
export async function detectInfrastructureRisks(
  supabase: SupabaseClient,
  issues: DbIssue[]
): Promise<DbInfrastructureRiskZone[]> {
  try {
    // Get risk zone thresholds
    const { data: thresholds } = await supabase.from("risk_zone_thresholds").select("*");

    if (!thresholds || thresholds.length === 0) {
      return [];
    }

    const detectedZones: DbInfrastructureRiskZone[] = [];

    // Group issues by category
    const issuesByCategory = issues.reduce<Record<string, DbIssue[]>>((acc, issue) => {
      if (!acc[issue.category]) {
        acc[issue.category] = [];
      }
      acc[issue.category].push(issue);
      return acc;
    }, {});

    // For each category with threshold, detect risk zones
    for (const category in issuesByCategory) {
      const categoryIssues = issuesByCategory[category];
      const threshold = thresholds.find((t) => t.category === category);

      if (!threshold) continue;

      // Cluster issues within radius
      const processedIssues = new Set<string>();

      for (const issue of categoryIssues) {
        if (processedIssues.has(issue.id)) continue;

        const nearbyIssues = categoryIssues.filter((other) => {
          if (processedIssues.has(other.id) || other.id === issue.id) return false;
          const distance = calculateDistance(
            issue.latitude,
            issue.longitude,
            other.latitude,
            other.longitude
          );
          return distance <= threshold.radius_meters;
        });

        const totalIssuesInZone = nearbyIssues.length + 1;

        // If cluster meets threshold, create risk zone
        if (totalIssuesInZone >= threshold.min_reports_for_zone) {
          // Calculate centroid
          let avgLat = issue.latitude;
          let avgLng = issue.longitude;

          if (nearbyIssues.length > 0) {
            const sumLat = nearbyIssues.reduce((sum, i) => sum + i.latitude, issue.latitude);
            const sumLng = nearbyIssues.reduce((sum, i) => sum + i.longitude, issue.longitude);
            avgLat = sumLat / (totalIssuesInZone);
            avgLng = sumLng / (totalIssuesInZone);
          }

          const riskZone: Partial<DbInfrastructureRiskZone> = {
            latitude: avgLat,
            longitude: avgLng,
            radius_meters: threshold.radius_meters,
            risk_type: threshold.risk_type,
            risk_level: threshold.risk_level_threshold,
            issue_count: totalIssuesInZone,
            last_issue_at: new Date().toISOString(),
            description: `High concentration of ${category} reports detected`,
          };

          detectedZones.push(riskZone as DbInfrastructureRiskZone);

          // Mark these issues as processed
          nearbyIssues.forEach((i) => processedIssues.add(i.id));
          processedIssues.add(issue.id);
        }
      }
    }

    // Store detected risk zones
    if (detectedZones.length > 0) {
      await supabase.from("infrastructure_risk_zones").insert(
        detectedZones.map((zone) => ({
          latitude: zone.latitude,
          longitude: zone.longitude,
          radius_meters: zone.radius_meters,
          risk_type: zone.risk_type,
          risk_level: zone.risk_level,
          issue_count: zone.issue_count,
          last_issue_at: zone.last_issue_at,
          description: zone.description,
        }))
      );
    }

    return detectedZones;
  } catch (error) {
    console.error("Error detecting infrastructure risks:", error);
    return [];
  }
}

/**
 * Get risk zones within a location radius
 */
export async function getRiskZonesNear(
  supabase: SupabaseClient,
  latitude: number,
  longitude: number,
  radiusKm: number = 5
): Promise<DbInfrastructureRiskZone[]> {
  try {
    const { data, error } = await supabase
      .from("infrastructure_risk_zones")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) throw error;

    return (data || []).filter((zone) => {
      const distance = calculateDistance(latitude, longitude, zone.latitude, zone.longitude);
      return distance <= radiusKm * 1000;
    });
  } catch (error) {
    console.error("Error fetching risk zones:", error);
    return [];
  }
}

/**
 * Get all active high/critical risk zones
 */
export async function getHighRiskZones(
  supabase: SupabaseClient
): Promise<DbInfrastructureRiskZone[]> {
  try {
    const { data, error } = await supabase
      .from("infrastructure_risk_zones")
      .select("*")
      .in("risk_level", ["high", "critical"])
      .order("risk_level", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching high risk zones:", error);
    return [];
  }
}

/**
 * Update risk zone issue count
 */
export async function updateRiskZoneIssueCount(
  supabase: SupabaseClient,
  zoneId: string,
  newCount: number
): Promise<DbInfrastructureRiskZone | null> {
  try {
    const { data, error } = await supabase
      .from("infrastructure_risk_zones")
      .update({
        issue_count: newCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", zoneId)
      .select()
      .single();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.error("Error updating risk zone:", error);
    return null;
  }
}
