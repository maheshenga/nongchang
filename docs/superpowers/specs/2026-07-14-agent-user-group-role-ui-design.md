# Agent User-Group Role UI Design

## Objective

Remove the authorization mismatch where an `agent_admin` can open the user-group page and see create, edit, and delete controls that the backend correctly reserves for `system_admin`.

This is the first implementation item from the production UI/UX P0 audit. It is intentionally limited to making the existing user-group screen truthful. User-to-group assignment is a separate workflow because the current merchant list contract does not expose `groupId` and adding it would require coordinated backend, shared-contract, and management-screen work.

## Current Boundary

The backend is already authoritative:

- `system_admin` may list, create, update, delete, and assign user groups;
- `agent_admin` may list groups and assign groups only within the agent-owned user scope;
- create, update, and delete handlers have method-level `Role.SYSTEM_ADMIN` guards.

The Web application currently renders the same `UserGroups` component for both roles. The component always exposes create, edit, and delete actions, so an agent administrator can start an operation that must fail at the API boundary.

## Considered Approaches

### A. Role-aware read-only page for agent administrators

Keep `用户分组` in agent navigation so the agent can understand the available permission groups, but render the page as read-only for `agent_admin`. Only `system_admin` receives create, edit, and delete controls.

This is the chosen approach because it preserves useful visibility, matches the backend boundary, and requires no contract or API changes.

### B. Remove user groups from agent navigation

This is the smallest navigation change, but it removes visibility into group names and permission configuration even though the backend explicitly allows agents to list groups. It also makes the later scoped assignment workflow harder to discover.

### C. Add scoped user assignment in the same change

This would provide the complete agent workflow, but the current `MerchantListItem` does not contain `groupId`. Implementing it now would expand the P0 fix into shared DTO, backend selection/serialization, agent-scoped merchant UI, assignment mutation, cache invalidation, and end-to-end testing. That work should be designed and implemented as its own follow-up.

## UI Design

`UserGroups` reads the authenticated role from `useAuth` and derives:

```ts
const canManageGroups = user?.role === Role.SYSTEM_ADMIN;
```

For `system_admin`:

- preserve the current `新建用户组` button;
- preserve row-level `编辑` and `删除` actions;
- preserve the create/edit dialog and destructive confirmation flow.

For `agent_admin`:

- keep the group table, default-group status, and permission counts visible;
- hide the `新建用户组`, `编辑`, and `删除` controls;
- remove the empty operations column rather than leaving blank cells;
- show a concise informational notice: `代理管理员可查看用户组配置；新建、编辑和删除由系统管理员负责。`;
- keep loading, error, empty, and retry states unchanged.

The component event handlers also check `canManageGroups` before opening or submitting mutations. This is not a replacement for backend authorization; it prevents accidental internal invocation and keeps the component behavior aligned with its visible state.

## Data Flow And Authorization

No API, shared DTO, backend controller, service, database, or navigation contract changes are required.

1. The authenticated Web shell continues routing both allowed roles to `UserGroups`.
2. `listUserGroups` continues loading tenant-scoped group data for both roles.
3. The authenticated role controls only which management controls are rendered.
4. Backend method-level guards remain the final security boundary for all mutation requests.

## Error Handling

Existing list and mutation error handling remains unchanged for system administrators. Agent administrators cannot initiate mutations from this component, so no new mutation-error state is introduced.

If the authenticated user is temporarily unavailable, the component fails closed and renders the read-only variant until the role is known.

## Testing

Component tests will mock `useAuth` with explicit roles.

Required coverage:

- an `agent_admin` can see the group list and read-only notice;
- an `agent_admin` cannot see create, edit, or delete controls;
- the operations column is absent for `agent_admin`;
- a `system_admin` retains create, edit, delete, permission editing, and delete confirmation behavior;
- existing API payload assertions remain unchanged.

Verification commands use the repository-pinned package manager:

```powershell
corepack pnpm@10.33.2 --filter web test -- UserGroups.spec.tsx
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web build
```

## Out Of Scope

- changing backend user-group authorization;
- removing the user-group navigation entry for agents;
- adding user-to-group assignment UI;
- changing group permission semantics or permission-guard bypass roles;
- redesigning the broader merchant management workflow.
