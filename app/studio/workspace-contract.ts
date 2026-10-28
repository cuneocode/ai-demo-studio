import type { StoredCompanyProfile } from "../company-profile";
import type { StoredResearchNote } from "../research-note";
import type { StoredAdvisoryBrief } from "../advisory-brief";

export type WorkspaceProps = {
  inStory: boolean; onBack: () => void; onAdd: () => void;
  companyProfile: StoredCompanyProfile | null; onCompanyProfileChange: (profile: StoredCompanyProfile | null) => void;
  researchNote: StoredResearchNote | null; onResearchNoteChange: (note: StoredResearchNote | null) => void;
  advisoryBrief: StoredAdvisoryBrief | null; onAdvisoryBriefChange: (brief: StoredAdvisoryBrief | null) => void;
};
