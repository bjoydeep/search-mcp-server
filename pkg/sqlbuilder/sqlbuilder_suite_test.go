package sqlbuilder

import (
	"testing"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

func TestSQLBuilder(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "SQLBuilder Suite")
}