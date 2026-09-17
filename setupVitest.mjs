// Test-environment registry bootstrap for the source-level test suite.
//
// The core is registry-only: template interpolation and JSON Schema
// validation need an implementation plugged in first. The subtlety: tests run
// against the SOURCE modules (../src), while plugin packages register into
// the package's dist instance — so here we register the implementations
// directly into the source instance:
//   - the template engine, taken verbatim from @isdk/template-engines
//   - AjvSchemaType from @isdk/match-ex-schema (a dist build). Operating
//     across module copies is safe by design: JsonSchemaType.isInstance()
//     falls back to a typeId check precisely so duplicates keep working.
import { setStringTemplate, setJsonSchemaType } from './src/index.js'
import { StringTemplate } from '@isdk/template-engines'
import { AjvSchemaType } from '@isdk/match-ex-schema'

setStringTemplate(StringTemplate)
setJsonSchemaType(AjvSchemaType)
