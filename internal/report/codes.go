package report

// Finding codes are API: they are added only by a minor release and never
// renamed. Gate failures also use the condition names from the rules block
// as codes; those are listed in Conditions.
const (
	CodeUsage = "usage"

	CodeInvalidPin            = "invalid-pin"
	CodeMissingPage           = "missing-page"
	CodeUnreachable           = "unreachable"
	CodeRulesBlockMissing     = "rules-block-missing"
	CodeRulesBlockAmbiguous   = "rules-block-ambiguous"
	CodeRulesSchemaUnknown    = "rules-schema-unknown"
	CodeRulesConditionUnknown = "rules-condition-unknown"
	CodeRulesPatternInvalid   = "rules-pattern-invalid"
	CodeLocalFormat           = "local-format"

	CodeFrontmatterMissing      = "frontmatter-missing"
	CodeFrontmatterFieldMissing = "frontmatter-field-missing"
	CodeStatusUnknown           = "status-unknown"
	CodeSectionMissing          = "section-missing"
	CodeSectionOrder            = "section-order"
	CodeTestPlanHeader          = "test-plan-header"
	CodeReviewLogHeader         = "review-log-header"

	CodeIDMalformed             = "id-malformed"
	CodeIDDuplicate             = "id-duplicate"
	CodeIDRecycled              = "id-recycled"
	CodeTestPlanRowMissing      = "test-plan-row-missing"
	CodeTestPlanCell            = "test-plan-cell"
	CodeTaskCriterionUnknown    = "task-criterion-unknown"
	CodeReviewRowMalformed      = "review-row-malformed"
	CodeReviewSubsectionMissing = "review-subsection-missing"
	CodeReviewRecordsMalformed  = "review-records-malformed"
	CodeReviewRecordsMixed      = "review-records-mixed"
	CodeAcceptanceReviewUnknown = "acceptance-review-unknown"
	CodeCoversPatternUnsupport  = "covers-pattern-unsupported"

	CodeNoReview             = "no-review"
	CodeDirtyTarget          = "dirty-target"
	CodeCommitUnreachable    = "commit-unreachable"
	CodeBaselineChanged      = "baseline-changed"
	CodeCoveredDrift         = "covered-drift"
	CodeCoveredChanged       = "covered-changed"
	CodeFeatureTreeDirty     = "feature-tree-dirty"
	CodeDefaultBranchUnknown = "default-branch-unknown"

	CodeGitTooOld = "git-too-old"

	CodeTransitionNotAllowed = "transition-not-allowed"

	CodeReviewNotFound = "review-not-found"
	CodeRecordsDiffer  = "records-differ"

	CodeError = "error"
)

// Conditions is the binary's condition vocabulary. The rules block composes
// these names; a gate reports each failing one as a finding with that code.
var Conditions = []string{
	"no_open_questions",
	"test_plan_complete",
	"spec_review_fresh",
	"spec_review_clean",
	"accepted",
	"tasks_populated",
	"tasks_open",
	"on_feature_branch_if_set",
	"all_met",
	"impl_review_fresh",
	"impl_review_clean",
	"feature_tree_clean",
}

// Codes lists every fixed finding code, for the output schema.
var Codes = []string{
	CodeUsage,
	CodeInvalidPin, CodeMissingPage, CodeUnreachable, CodeRulesBlockMissing, CodeRulesBlockAmbiguous,
	CodeRulesSchemaUnknown, CodeRulesConditionUnknown, CodeRulesPatternInvalid, CodeLocalFormat,
	CodeFrontmatterMissing, CodeFrontmatterFieldMissing, CodeStatusUnknown, CodeSectionMissing,
	CodeSectionOrder, CodeTestPlanHeader, CodeReviewLogHeader,
	CodeIDMalformed, CodeIDDuplicate, CodeIDRecycled, CodeTestPlanRowMissing, CodeTestPlanCell,
	CodeTaskCriterionUnknown, CodeReviewRowMalformed, CodeReviewSubsectionMissing,
	CodeReviewRecordsMalformed, CodeReviewRecordsMixed, CodeAcceptanceReviewUnknown,
	CodeCoversPatternUnsupport,
	CodeNoReview, CodeDirtyTarget, CodeCommitUnreachable, CodeBaselineChanged, CodeCoveredDrift,
	CodeCoveredChanged, CodeFeatureTreeDirty, CodeDefaultBranchUnknown,
	CodeGitTooOld,
	CodeTransitionNotAllowed,
	CodeReviewNotFound, CodeRecordsDiffer,
	CodeError,
}
