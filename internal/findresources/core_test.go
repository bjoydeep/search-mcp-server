package findresources

import (
	"testing"

	"github.com/stolostron/search-mcp-server/internal/server/auth"
	"github.com/stretchr/testify/assert"
)

// Note: Actual database mocking would require proper interfaces

func TestFindResourcesCore_validateArgs(t *testing.T) {
	core := NewFindResourcesCore(nil)

	tests := []struct {
		name    string
		args    FindResourcesArgs
		wantErr bool
	}{
		{
			name: "valid basic args",
			args: FindResourcesArgs{
				Kind:       "Pod",
				Namespace:  "default",
				OutputMode: OutputModeList,
				Limit:      50,
			},
			wantErr: false,
		},
		{
			name: "invalid output mode",
			args: FindResourcesArgs{
				OutputMode: "invalid",
			},
			wantErr: true,
		},
		{
			name: "invalid limit too high",
			args: FindResourcesArgs{
				Limit: 2000,
			},
			wantErr: true,
		},
		{
			name: "invalid sort order",
			args: FindResourcesArgs{
				SortOrder: "invalid",
			},
			wantErr: true,
		},
		{
			name: "empty args should pass with defaults",
			args: FindResourcesArgs{},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := core.validateArgs(tt.args)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestFindResourcesCore_normalizeArgs(t *testing.T) {
	core := NewFindResourcesCore(nil)

	tests := []struct {
		name     string
		args     FindResourcesArgs
		expected FindResourcesArgs
	}{
		{
			name: "apply defaults",
			args: FindResourcesArgs{},
			expected: FindResourcesArgs{
				OutputMode: DefaultOutputMode,
				Limit:      DefaultLimit,
				SortOrder:  DefaultSortOrder,
				GroupBy:    "",
			},
		},
		{
			name: "count mode gets default groupBy",
			args: FindResourcesArgs{
				OutputMode: OutputModeCount,
			},
			expected: FindResourcesArgs{
				OutputMode: OutputModeCount,
				Limit:      DefaultLimit,
				SortOrder:  DefaultSortOrder,
				GroupBy:    "status",
			},
		},
		{
			name: "preserve existing values",
			args: FindResourcesArgs{
				OutputMode: OutputModeSummary,
				Limit:      100,
				SortOrder:  SortOrderDesc,
				GroupBy:    "cluster",
			},
			expected: FindResourcesArgs{
				OutputMode: OutputModeSummary,
				Limit:      100,
				SortOrder:  SortOrderDesc,
				GroupBy:    "cluster",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := core.normalizeArgs(tt.args)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestFindResourcesCore_combineClusterFilters(t *testing.T) {
	core := NewFindResourcesCore(nil)

	tests := []struct {
		name            string
		explicitCluster interface{}
		targetClusters  []string
		expected        []string
	}{
		{
			name:            "no filters",
			explicitCluster: nil,
			targetClusters:  nil,
			expected:        []string{},
		},
		{
			name:            "only explicit cluster (string)",
			explicitCluster: "cluster1",
			targetClusters:  nil,
			expected:        []string{"cluster1"},
		},
		{
			name:            "only explicit clusters (slice)",
			explicitCluster: []string{"cluster1", "cluster2"},
			targetClusters:  nil,
			expected:        []string{"cluster1", "cluster2"},
		},
		{
			name:            "only target clusters",
			explicitCluster: nil,
			targetClusters:  []string{"cluster1", "cluster2"},
			expected:        []string{"cluster1", "cluster2"},
		},
		{
			name:            "intersection of both",
			explicitCluster: []string{"cluster1", "cluster2", "cluster3"},
			targetClusters:  []string{"cluster2", "cluster3", "cluster4"},
			expected:        []string{"cluster2", "cluster3"},
		},
		{
			name:            "no intersection",
			explicitCluster: []string{"cluster1"},
			targetClusters:  []string{"cluster2"},
			expected:        []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := core.combineClusterFilters(tt.explicitCluster, tt.targetClusters)
			assert.ElementsMatch(t, tt.expected, result)
		})
	}
}

func TestFindResourcesCore_createEmptyResult(t *testing.T) {
	core := NewFindResourcesCore(nil)

	tests := []struct {
		name       string
		args       FindResourcesArgs
		expectType string
	}{
		{
			name:       "list mode",
			args:       FindResourcesArgs{OutputMode: OutputModeList},
			expectType: "[]ResourceResult",
		},
		{
			name:       "count mode",
			args:       FindResourcesArgs{OutputMode: OutputModeCount},
			expectType: "[]CountResult",
		},
		{
			name:       "summary mode",
			args:       FindResourcesArgs{OutputMode: OutputModeSummary},
			expectType: "SummaryResult",
		},
		{
			name:       "health mode",
			args:       FindResourcesArgs{OutputMode: OutputModeHealth},
			expectType: "HealthResult",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := core.createEmptyResult(tt.args)
			assert.NotNil(t, result)
			assert.Equal(t, tt.args.OutputMode, result.Mode)
			assert.Equal(t, 0, result.Metadata.TotalCount)

			// Verify data type
			switch tt.expectType {
			case "[]ResourceResult":
				_, ok := result.Data.([]ResourceResult)
				assert.True(t, ok, "Expected []ResourceResult")
			case "[]CountResult":
				_, ok := result.Data.([]CountResult)
				assert.True(t, ok, "Expected []CountResult")
			case "SummaryResult":
				_, ok := result.Data.(SummaryResult)
				assert.True(t, ok, "Expected SummaryResult")
			case "HealthResult":
				_, ok := result.Data.(HealthResult)
				assert.True(t, ok, "Expected HealthResult")
			}
		})
	}
}

func TestFindResourcesCore_buildOrderByClause(t *testing.T) {
	core := NewFindResourcesCore(nil)

	tests := []struct {
		name      string
		sortBy    string
		sortOrder string
		expected  string
	}{
		{
			name:      "sort by name asc",
			sortBy:    "name",
			sortOrder: "asc",
			expected:  "data->>'name' ASC",
		},
		{
			name:      "sort by created desc",
			sortBy:    "created",
			sortOrder: "desc",
			expected:  "data->>'created' DESC",
		},
		{
			name:      "sort by namespace",
			sortBy:    "namespace",
			sortOrder: "asc",
			expected:  "data->>'namespace' ASC",
		},
		{
			name:      "default sort (unknown field)",
			sortBy:    "unknown",
			sortOrder: "desc",
			expected:  "data->>'name' DESC",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := core.buildOrderByClause(tt.sortBy, tt.sortOrder)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// Test basic compilation and instantiation
func TestNewFindResourcesCore(t *testing.T) {
	core := NewFindResourcesCore(nil)
	assert.NotNil(t, core)
}

// Test that all output mode constants are defined
func TestOutputModeConstants(t *testing.T) {
	assert.Equal(t, "list", OutputModeList)
	assert.Equal(t, "count", OutputModeCount)
	assert.Equal(t, "summary", OutputModeSummary)
	assert.Equal(t, "health", OutputModeHealth)
}

// Test that default constants are reasonable
func TestDefaultConstants(t *testing.T) {
	assert.Equal(t, "list", DefaultOutputMode)
	assert.Equal(t, 50, DefaultLimit)
	assert.Equal(t, 1000, MaxLimit)
	assert.Equal(t, "asc", DefaultSortOrder)
}

func TestConvertKindFilter(t *testing.T) {
	core := NewFindResourcesCore(nil)

	tests := []struct {
		name     string
		input    interface{}
		expected []string
	}{
		{"nil input", nil, nil},
		{"empty string", "", nil},
		{"single kind", "Pod", []string{"Pod"}},
		{"comma-separated", "Pod,ConfigMap,Service", []string{"Pod", "ConfigMap", "Service"}},
		{"comma with spaces", " Pod , ConfigMap ", []string{"Pod", "ConfigMap"}},
		{"string slice", []string{"Pod", "Deployment"}, []string{"Pod", "Deployment"}},
		{"string slice with empties", []string{"Pod", "", "Service"}, []string{"Pod", "Service"}},
		{"empty string slice", []string{}, nil},
		{"unsupported type", 42, nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := core.convertKindFilter(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestFilterPermsByKind(t *testing.T) {
	core := NewFindResourcesCore(nil)

	podCore := auth.ResourcePermission{Kind: "Pod", APIGroup: ""}
	deployApps := auth.ResourcePermission{Kind: "Deployment", APIGroup: "apps"}
	wildcardApps := auth.ResourcePermission{Kind: "*", APIGroup: "apps"}
	wildcardAll := auth.ResourcePermission{Kind: "*", APIGroup: "*"}

	tests := []struct {
		name       string
		perms      []auth.ResourcePermission
		kindFilter interface{}
		expected   []auth.ResourcePermission
	}{
		{
			"nil filter returns all perms",
			[]auth.ResourcePermission{podCore, deployApps},
			nil,
			[]auth.ResourcePermission{podCore, deployApps},
		},
		{
			"empty string filter returns all perms",
			[]auth.ResourcePermission{podCore, deployApps},
			"",
			[]auth.ResourcePermission{podCore, deployApps},
		},
		{
			"matching kind preserves apigroup",
			[]auth.ResourcePermission{podCore, deployApps},
			"Pod",
			[]auth.ResourcePermission{podCore},
		},
		{
			"case-insensitive match",
			[]auth.ResourcePermission{podCore},
			"pod",
			[]auth.ResourcePermission{podCore},
		},
		{
			"no match returns empty",
			[]auth.ResourcePermission{podCore, deployApps},
			"Secret",
			nil,
		},
		{
			"wildcard kind expands to requested kinds",
			[]auth.ResourcePermission{wildcardApps},
			"Pod,Deployment",
			[]auth.ResourcePermission{
				{Kind: "Pod", APIGroup: "apps"},
				{Kind: "Deployment", APIGroup: "apps"},
			},
		},
		{
			"wildcard all expands to requested kinds",
			[]auth.ResourcePermission{wildcardAll},
			"Pod",
			[]auth.ResourcePermission{
				{Kind: "Pod", APIGroup: "*"},
			},
		},
		{
			"multiple perms multiple kinds",
			[]auth.ResourcePermission{podCore, deployApps},
			"Pod,Deployment,Secret",
			[]auth.ResourcePermission{podCore, deployApps},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := core.filterPermsByKind(tt.perms, tt.kindFilter)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestBuildAPIGroupKindConditions(t *testing.T) {
	core := NewFindResourcesCore(nil)

	tests := []struct {
		name           string
		perms          []auth.ResourcePermission
		expectedSQL    string
		expectedParams []interface{}
	}{
		{
			"full wildcard",
			[]auth.ResourcePermission{{Kind: "*", APIGroup: "*"}},
			"1 = 1",
			nil,
		},
		{
			"empty perms",
			[]auth.ResourcePermission{},
			"",
			nil,
		},
		{
			"single kind with specific apigroup",
			[]auth.ResourcePermission{{Kind: "Deployment", APIGroup: "apps"}},
			"(data->>'apigroup' = %s AND data->>'kind' = %s)",
			[]interface{}{"apps", "Deployment"},
		},
		{
			"single kind with empty apigroup (core)",
			[]auth.ResourcePermission{{Kind: "Pod", APIGroup: ""}},
			"((data->>'apigroup' IS NULL OR data->>'apigroup' = '') AND data->>'kind' = %s)",
			[]interface{}{"Pod"},
		},
		{
			"wildcard apigroup with specific kind",
			[]auth.ResourcePermission{{Kind: "Pod", APIGroup: "*"}},
			"data->>'kind' = %s",
			[]interface{}{"Pod"},
		},
		{
			"specific apigroup with wildcard kind",
			[]auth.ResourcePermission{{Kind: "*", APIGroup: "apps"}},
			"data->>'apigroup' = %s",
			[]interface{}{"apps"},
		},
		{
			"multiple kinds same apigroup",
			[]auth.ResourcePermission{
				{Kind: "Deployment", APIGroup: "apps"},
				{Kind: "DaemonSet", APIGroup: "apps"},
			},
			"(data->>'apigroup' = %s AND data->>'kind' IN (%s,%s))",
			[]interface{}{"apps", "Deployment", "DaemonSet"},
		},
		{
			"multiple apigroups",
			[]auth.ResourcePermission{
				{Kind: "Pod", APIGroup: ""},
				{Kind: "Deployment", APIGroup: "apps"},
			},
			"((data->>'apigroup' IS NULL OR data->>'apigroup' = '') AND data->>'kind' = %s) OR (data->>'apigroup' = %s AND data->>'kind' = %s)",
			[]interface{}{"Pod", "apps", "Deployment"},
		},
		{
			"dedup same kind same apigroup",
			[]auth.ResourcePermission{
				{Kind: "Pod", APIGroup: ""},
				{Kind: "Pod", APIGroup: ""},
			},
			"((data->>'apigroup' IS NULL OR data->>'apigroup' = '') AND data->>'kind' = %s)",
			[]interface{}{"Pod"},
		},
		{
			"empty apigroup wildcard kind",
			[]auth.ResourcePermission{{Kind: "*", APIGroup: ""}},
			"(data->>'apigroup' IS NULL OR data->>'apigroup' = '')",
			nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sql, params := core.buildAPIGroupKindConditions(tt.perms)
			assert.Equal(t, tt.expectedSQL, sql)
			assert.Equal(t, tt.expectedParams, params)
		})
	}
}