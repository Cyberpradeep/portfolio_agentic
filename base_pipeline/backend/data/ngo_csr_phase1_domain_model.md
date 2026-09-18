# NGO–CSR Bridging Platform — Phase 1 Digital Domain/ER Model

## Phase 1 scope

- NGO registration and organization information
- NGO profile create/update
- NGO government/supporting documents
- Document-level verification
- Overall compliance status
- Project create/update
- Project documents
- Estimated project cost / project cost report
- UN SDG alignment
- Schedule VII alignment
- AI suggestions for alignment
- NGO accepts/rejects AI suggestions

Excluded from Phase 1:
- Funding
- Payments
- Transactions
- Bank integration
- Fund utilization
- Expense tracking
- CSR–NGO matching
- Impact verification

## Digital ER diagram

```mermaid
erDiagram
    NGO ||--|| NGO_PROFILE : has
    NGO ||--o{ DOCUMENT : owns
    DOCUMENT_TYPE ||--o{ DOCUMENT : classifies
    NGO ||--|| COMPLIANCE : has
    NGO ||--o{ PROJECT : owns
    PROJECT ||--o{ PROJECT_DOCUMENT : has
    PROJECT ||--o{ AI_ALIGNMENT_SUGGESTION : receives
    PROJECT ||--o{ PROJECT_SDG : aligns_to
    UN_SDG ||--o{ PROJECT_SDG : referenced_by
    PROJECT ||--o{ PROJECT_SCHEDULE_VII : aligns_to
    SCHEDULE_VII_ITEM ||--o{ PROJECT_SCHEDULE_VII : referenced_by

    NGO {
        string ngo_id PK
        string legal_name
        string display_name
        string organization_type
        string official_email
        string official_phone
        string contact_person_name
        string website
        string status
        datetime created_at
        datetime updated_at
    }

    NGO_PROFILE {
        string profile_id PK
        string ngo_id FK
        text about
        text mission
        text vision
        string address
        string operating_areas
    }

    DOCUMENT_TYPE {
        string document_type_id PK
        string code
        string name
        string description
    }

    DOCUMENT {
        string document_id PK
        string ngo_id FK
        string document_type_id FK
        string document_number
        string file_reference
        date issue_date
        date expiry_date
        string verification_status
        datetime uploaded_at
    }

    COMPLIANCE {
        string compliance_id PK
        string ngo_id FK
        string status
        datetime verified_at
        text remarks
    }

    PROJECT {
        string project_id PK
        string ngo_id FK
        string name
        text description
        text problem_statement
        text objectives
        string location
        date start_date
        date end_date
        decimal estimated_cost
        string status
        datetime created_at
        datetime updated_at
    }

    PROJECT_DOCUMENT {
        string project_document_id PK
        string project_id FK
        string document_type
        string file_reference
        datetime uploaded_at
    }

    UN_SDG {
        string sdg_id PK
        string code
        string name
        string description
    }

    PROJECT_SDG {
        string project_id PK, FK
        string sdg_id PK, FK
        text rationale
    }

    SCHEDULE_VII_ITEM {
        string item_id PK
        string code
        string name
        string description
    }

    PROJECT_SCHEDULE_VII {
        string project_id PK, FK
        string item_id PK, FK
        text rationale
    }

    AI_ALIGNMENT_SUGGESTION {
        string suggestion_id PK
        string project_id FK
        string framework_type
        string reference_id
        text reason
        string confidence
        string status
        datetime created_at
    }

```

## Core mental model

```text
NGO
├── Registration / Onboarding
├── Profile
├── Documents
│   └── Document Type
├── Compliance
└── Projects
    ├── Project Details
    ├── Project Documents
    ├── Estimated Cost / Cost Report
    ├── AI Alignment Suggestions
    └── Confirmed Alignment
        ├── UN SDG
        └── Schedule VII
```

## Important modeling decisions

### Registration
Registration is the onboarding process that creates the NGO. We are not keeping a separate registration table in the current Phase 1 ER model.

### Documents
Document Type is controlled/reference data. Example types:
- CSR-1
- FCRA
- PAN
- 12A / 12AB
- 80G
- 2-FY Reports
- Registration Certificate
- Other

`document_number`, `issue_date`, and `expiry_date` are optional because they do not apply to every document type.

### Compliance
`DOCUMENT.verification_status` answers:
> Has this individual document been reviewed?

`COMPLIANCE.status` answers:
> What is the NGO's overall compliance/verification status?

### Project cost
`PROJECT.estimated_cost` represents the expected cost of the project. It is not funding received.

### AI alignment
AI suggests possible UN SDGs and Schedule VII items. The NGO reviews the suggestions. Only accepted/confirmed selections become the project's actual alignment.
