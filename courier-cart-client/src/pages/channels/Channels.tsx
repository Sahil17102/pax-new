import { Stack } from '@mui/material'
import AdminPageShell from '../../components/admin/AdminPageShell'
import AllChannelOptions from '../../components/channels/AllChannelOptions'
import UserConnectedChannels from '../../components/channels/UserConnectedChannels'

const Channels = () => {
  return (
    <AdminPageShell
      title="Channel connection workspace"
      badge="Integrations"
      description="Connect sales channels, review live store links, and keep inbound order sources organized under one Pax Logistics admin surface."
      metrics={[
        { label: 'Primary channel', value: 'Shopify', hint: 'Live connection currently supported' },
        { label: 'Connection model', value: 'Centralized', hint: 'Stores managed in one workspace' },
        { label: 'Order intake', value: 'Structured', hint: 'Connected sources stay visible and editable' },
      ]}
    >
      <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.2 } }}>
        <UserConnectedChannels />
        <AllChannelOptions />
      </Stack>
    </AdminPageShell>
  )
}

export default Channels
