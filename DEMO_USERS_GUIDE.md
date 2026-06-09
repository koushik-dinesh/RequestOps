# RequestOps Demo Users

Password for every demo account: `Password123!`

## Department Users
Each department has exactly one Department HOD and two Employee/Requester users.

| Department | HOD | Employee 1 | Employee 2 |
| --- | --- | --- | --- |
| Administration | `VIO-0001` Meera Nair | `VIO-0013` Anand Rao | `VIO-0014` Pooja Kulkarni |
| Business Development | `VIO-0002` Siddharth Kapoor | `VIO-0015` Rhea Malhotra | `VIO-0016` Kabir Sethi |
| Engineering | `VIO-0003` Ananya Iyer | `VIO-0017` Ravi Narayan | `VIO-0018` Diya Shah |
| Finance | `VIO-0004` Priya Raman | `VIO-0019` Neha Gupta | `VIO-0020` Arjun Bose |
| Human Resources | `VIO-0005` Aisha Khan | `VIO-0021` Maya Nambiar | `VIO-0022` Karan Mehta |
| IT | `VIO-0006` Omar Khan | `VIO-0023` Devika Nair | `VIO-0024` Ishan Patel |
| Operations | `VIO-0007` Rahul Menon | `VIO-0025` Balaji Krishnan | `VIO-0026` Harini Subramanian |
| Procurement | `VIO-0008` Deepak Rao | `VIO-0027` Tanvi Desai | `VIO-0028` Nikhil Verma |
| Production | `VIO-0009` Suresh Babu | `VIO-0029` Kavya Nandakumar | `VIO-0030` Sameer Khan |
| Quality | `VIO-0010` Harish Quality | `VIO-0031` Manoj Pillai | `VIO-0032` Divya Suresh |
| Sales & Marketing | `VIO-0011` Rohan Mehta | `VIO-0033` Isha Malhotra | `VIO-0034` Vivek Narayan |
| Supply Chain | `VIO-0012` Kavita Singh | `VIO-0035` Ritu Chawla | `VIO-0036` Farhan Ali |

Email format for these users is firstname.lastname.demo@requestops.local.

## Workflow Specialist Users
| Role | User 1 | User 2 |
| --- | --- | --- |
| System Admin | `VIO-0037` Aarav Mehta | `VIO-0038` Leela Iyer |
| IT HOD | `VIO-0039` Meera Krishnan | `VIO-0040` Vikram Rao |
| Project Manager | `VIO-0041` Anika Das | `VIO-0042` Rohan Sen |
| Developer | `VIO-0043` Arjun Pillai | `VIO-0044` Nisha Kapoor |
| QA Engineer | `VIO-0045` Kiran Babu | `VIO-0046` Maya Thomas |
| UAT Approver | `VIO-0047` Kavya Menon | `VIO-0048` Sanjay Bhat |

## Demo Request Coverage
| Status | Requests |
| --- | --- |
| Department Approval Pending | `RQ-001`, `RQ-002` |
| IT Review Pending | `RQ-003`, `RQ-004` |
| PM Assigned | `RQ-005`, `RQ-006` |
| Scope Review | `RQ-007`, `RQ-008` |
| User Story Review | `RQ-009`, `RQ-010` |
| Developer Assigned | `RQ-011`, `RQ-012` |
| Sprint Planning | `RQ-013`, `RQ-014` |
| In Development | `RQ-015`, `RQ-016` |
| QA Pending | `RQ-017`, `RQ-018` |
| UAT Pending | `RQ-019`, `RQ-020` |
| Deployment Pending | `RQ-021`, `RQ-022` |
| Deployed | `RQ-023`, `RQ-024` |

## Recommended Test Flow
1. Log in as an employee, for example `VIO-0019`, and create a request.
2. Log in as that department HOD, for example `VIO-0004`, to approve it.
3. Log in as IT HOD `VIO-0039` to review and assign a PM.
4. Log in as PM `VIO-0041` to manage scope, user stories, sprint planning, and delivery.
5. Continue as Developer `VIO-0043`, QA `VIO-0045`, and UAT Approver `VIO-0047`.
