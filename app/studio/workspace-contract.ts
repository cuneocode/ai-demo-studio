import type { StoredCompanyProfile } from "../../verticals/fsi/company-profile";
import type { StoredResearchNote } from "../../verticals/fsi/wealth/research-note";
import type { StoredAdvisoryBrief } from "../../demos/client-advisory/ui/advisory-brief";

export type WorkspaceProps = {
  inStory: boolean; onBack: () => void; onAdd: () => void;
  companyProfile: StoredCompanyProfile | null; onCompanyProfileChange: (profile: StoredCompanyProfile | null) => void;
  researchNote: StoredResearchNote | null; onResearchNoteChange: (note: StoredResearchNote | null) => void;
  advisoryBrief: StoredAdvisoryBrief | null; onAdvisoryBriefChange: (brief: StoredAdvisoryBrief | null) => void;
};
