"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthUserSafe, getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { getMapboxToken } from "@/lib/mapbox";
import { createIssueEvent } from "@/lib/issue-events";
import { findPotentialDuplicates, type DuplicateCandidate } from "@/lib/duplicate-detection";
import { ensureUserProfile, getCurrentUserRole } from "@/lib/user-profile";

const ISSUE_IMAGE_BUCKET = "issue-images";

type Coordinates = {
  latitude: number;
  longitude: number;
};

export default function ReportPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateCandidate[]>([]);
  const [confirmedDuplicateOverride, setConfirmedDuplicateOverride] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  const mapboxToken = useMemo(() => getMapboxToken(), []);

  const miniMapUrl = useMemo(() => {
    if (!location || !mapboxToken) {
      return null;
    }

    const { longitude, latitude } = location;
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+2563eb(${longitude},${latitude})/${longitude},${latitude},15,0/600x300?access_token=${mapboxToken}`;
  }, [location, mapboxToken]);

  useEffect(() => {
    const requireLogin = async () => {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        return;
      }

      const { user } = await getAuthUserSafe();
      if (!user) {
        router.replace("/login?next=/report");
        return;
      }

      const role = await getCurrentUserRole();
      if (role === "authority" || role === "admin") {
        router.replace("/admin/dashboard");
      }
    };

    void requireLogin();
  }, [router]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported on this device.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationError(null);
        setLocating(false);
      },
      (error) => {
        setLocationError(error.message || "Unable to detect your location.");
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    setDuplicateCandidates([]);
    setConfirmedDuplicateOverride(false);
  }, [title, description, category, location?.latitude, location?.longitude]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImageFile(file);

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    if (file) {
      setImagePreviewUrl(URL.createObjectURL(file));
    } else {
      setImagePreviewUrl(null);
    }
  };

  const refreshLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported on this device.");
      return;
    }

    setLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocating(false);
      },
      (error) => {
        setLocationError(error.message || "Unable to detect your location.");
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!title || !description || !category || !imageFile || !location) {
      setStatusMessage("Please complete all fields, upload an image, and allow location access.");
      return;
    }

    setSubmitting(true);
    setStatusMessage("Submitting report...");

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured yet.");
      }

      if (!confirmedDuplicateOverride) {
        const { data: existingIssues, error: existingIssuesError } = await supabase
          .from("issues")
          .select("id,title,description,category,road_name,landmark,area_name,latitude,longitude,image_url,status,created_by,created_at,upvote_count,downvote_count,is_priority")
          .neq("status", "resolved")
          .order("created_at", { ascending: false })
          .limit(200);

        if (!existingIssuesError) {
          const candidates = findPotentialDuplicates(
            {
              title,
              description,
              category,
              latitude: location.latitude,
              longitude: location.longitude,
            },
            existingIssues ?? []
          );

          if (candidates.length > 0) {
            setDuplicateCandidates(candidates);
            setStatusMessage("Similar nearby reports found. Review them, then confirm if you still want to submit this as a new issue.");
            return;
          }
        }
      }

      const profile = await ensureUserProfile();
      if (!profile?.id) {
        throw new Error("Please log in before reporting an issue.");
      }
      const createdBy = profile.id;

      const fileExt = imageFile.name.split(".").pop() || "jpg";
      const fileName = `${createdBy}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from(ISSUE_IMAGE_BUCKET).upload(fileName, imageFile, {
        cacheControl: "3600",
        upsert: false,
      });

      if (uploadError) {
        throw new Error(`Image upload failed: ${uploadError.message}`);
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(ISSUE_IMAGE_BUCKET).getPublicUrl(fileName);

      const { data: insertedIssue, error: insertError } = await supabase
        .from("issues")
        .insert({
          title,
          description,
          category,
          latitude: location.latitude,
          longitude: location.longitude,
          image_url: publicUrl,
          status: "pending",
          created_by: createdBy,
          upvote_count: 0,
        })
        .select("id")
        .single();

      if (insertError) {
        throw new Error(`Report save failed: ${insertError.message}`);
      }

      await createIssueEvent(supabase, {
        issueId: insertedIssue.id,
        eventType: "reported",
        message: "Issue reported by citizen",
        createdBy: "citizen",
      });

      setDuplicateCandidates([]);
      setConfirmedDuplicateOverride(false);
      setStatusMessage("Report submitted successfully.");
      router.push(`/issue/${insertedIssue.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit report.";
      setStatusMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-md space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Report an Issue</h1>
        <p className="mt-1 text-sm text-slate-600">Capture the issue, confirm location, and submit.</p>
      </div>

      <form onSubmit={handleSubmit} className="surface-card space-y-4 p-4 sm:p-5">
        <div className="space-y-1.5">
          <label htmlFor="title" className="text-sm font-medium text-slate-700">
            Title
          </label>
          <input
            id="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            type="text"
            placeholder="Short issue summary"
            className="input-base"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="description" className="text-sm font-medium text-slate-700">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            placeholder="Describe what you observed"
            className="input-base"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="category" className="text-sm font-medium text-slate-700">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="input-base"
            required
          >
            <option value="" disabled>
              Select issue type
            </option>
            <option value="pothole">Pothole</option>
            <option value="garbage">Garbage</option>
            <option value="streetlight">Broken Streetlight</option>
            <option value="water">Water Leakage</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="image" className="text-sm font-medium text-slate-700">
            Issue Photo
          </label>
          <input
            id="image"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageChange}
            className="input-base"
            required
          />
          <p className="text-xs text-slate-500">Camera opens on mobile, and gallery upload is also supported.</p>
          {imagePreviewUrl ? (
            <img src={imagePreviewUrl} alt="Issue preview" className="mt-2 h-40 w-full rounded-md border border-slate-200 object-cover" />
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">Detected Location</p>
            <button
              type="button"
              onClick={refreshLocation}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              {locating ? "Detecting..." : "Refresh GPS"}
            </button>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
            {location ? (
              <>
                {miniMapUrl ? (
                  <img src={miniMapUrl} alt="Location preview" className="h-36 w-full rounded-md object-cover" />
                ) : (
                  <div className="flex h-36 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-500">
                    Map preview unavailable (missing Mapbox token).
                  </div>
                )}
                <p className="mt-2 text-xs text-slate-600">
                  Lat: {location.latitude.toFixed(6)}, Lng: {location.longitude.toFixed(6)}
                </p>
              </>
            ) : (
              <div className="flex h-36 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-500">
                {locating ? "Detecting your location..." : "Location not available."}
              </div>
            )}
          </div>

          {locationError ? <p className="text-xs text-red-600">{locationError}</p> : null}
        </div>

        {duplicateCandidates.length > 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">Potential duplicate reports detected nearby</p>
            <p className="mt-1 text-xs text-amber-800">
              To reduce duplicate reports, review these active issues first. If your report is different, confirm and submit.
            </p>
            <ul className="mt-2 space-y-2">
              {duplicateCandidates.map((candidate) => (
                <li key={candidate.issue.id} className="rounded border border-amber-200 bg-white p-2">
                  <p className="text-sm font-medium text-slate-900">{candidate.issue.title}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {candidate.issue.category} · {Math.round(candidate.distanceMeters)}m away · Similarity {Math.round(candidate.textSimilarity * 100)}% · Upvotes {candidate.issue.upvote_count}
                  </p>
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-blue-700 underline"
                    onClick={() => router.push(`/issue/${candidate.issue.id}`)}
                  >
                    View existing issue
                  </button>
                </li>
              ))}
            </ul>
            {!confirmedDuplicateOverride ? (
              <button
                type="button"
                className="btn-warning mt-3 px-3 py-2 text-xs"
                onClick={() => {
                  setConfirmedDuplicateOverride(true);
                  setStatusMessage("Duplicate warning acknowledged. Submit again to create a new issue.");
                }}
              >
                I Understand, Submit as New Issue
              </button>
            ) : (
              <p className="mt-3 text-xs font-medium text-amber-900">Duplicate warning acknowledged. Submit to continue.</p>
            )}
          </div>
        ) : null}

        {statusMessage ? <p className="text-sm text-slate-700">{statusMessage}</p> : null}

        <button type="submit" disabled={submitting} className="btn-primary w-full py-2.5">
          {submitting ? "Submitting..." : "Submit Report"}
        </button>
      </form>
    </section>
  );
}