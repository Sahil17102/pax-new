import { alpha, Box, Button, Grid, Skeleton, Stack, Typography } from '@mui/material'
import React, { useState } from 'react'
import { MdOutlineAccountBalance } from 'react-icons/md'
import {
  useAddBankAccount,
  useBankAccounts,
  useDeleteBankAccount,
  useEditBankAccount,
  useMakePrimaryBankAccount,
} from '../../../../hooks/User/BankAccounts/useBankAccounts'
import type { BankAccount } from '../../../../types/user.types'
import { toast } from '../../../UI/Toast'
import { AddBankAccountDialog } from './AddBankAccountDialog'
import { BankAccountsList } from './BankAccountList'

export const BankAccountsSection: React.FC = () => {
  const [open, setOpen] = useState(false)
  const { data: accounts, isLoading } = useBankAccounts()
  const addBank = useAddBankAccount()
  const editBank = useEditBankAccount()

  const makePrimary = useMakePrimaryBankAccount()
  const delBank = useDeleteBankAccount()

  const [editing, setEditing] = useState<BankAccount | null>(null)

  const openAddDialog = () => {
    setEditing(null)
    setOpen(true)
  }

  const closeDialog = () => {
    setOpen(false)
    setEditing(null)
  }

  const handleMakePrimary = (id: string) => {
    makePrimary.mutate(id, {
      onSuccess: () =>
        toast.open({
          message: 'Primary account updated!',
          severity: 'success',
        }),
      onError: (err) => toast.open({ message: err.message, severity: 'error' }),
    })
  }

  const openEdit = (id: string) => {
    const acc = accounts?.find((a: BankAccount) => a.id === id)
    if (acc) {
      setEditing(acc)
      setOpen(true)
    }
  }

  const handleAdd = (data: Partial<BankAccount>) => {
    if (editing) {
      /* ---------- EDIT ---------- */
      editBank.mutate(
        { id: editing.id, patch: data },
        {
          onSuccess: () => {
            toast.open({ message: 'Bank Account updated!' })
            closeDialog()
          },
          onError: (err) => toast.open({ message: err.message, severity: 'error' }),
        },
      )
    } else {
      /* ---------- ADD ---------- */
      addBank.mutate(data as BankAccount, {
        onSuccess: () => {
          toast.open({ message: 'Bank Account added successfully!' })
          closeDialog()
        },
        onError: (err) => toast.open({ message: err.message, severity: 'error' }),
      })
    }
  }

  const handleDelete = (id: string) => {
    delBank.mutate(id, {
      onSuccess: () => toast.open({ message: 'Bank account deleted', severity: 'success' }),
      onError: (err) => toast.open({ message: err.message, severity: 'error' }),
    })
  }

  return (
    <Stack spacing={3} width={'100%'}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', md: 'center' },
          flexDirection: { xs: 'column', md: 'row' },
          gap: 1.5,
          p: 2,
          border: `1px solid ${alpha('#062A5B', 0.12)}`,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(251,245,242,0.98) 100%)',
        }}
      >
        <Stack spacing={0.4}>
          <Typography sx={{ fontSize: '0.72rem', letterSpacing: '0.16em', fontWeight: 800, color: '#ED1C24', textTransform: 'uppercase' }}>
            Settlement accounts
          </Typography>
          <Typography sx={{ fontSize: '1.2rem', fontWeight: 800, color: '#111827' }}>
            Banking details for payouts and COD remittance
          </Typography>
          <Typography sx={{ fontSize: '0.92rem', color: '#4B5563' }}>
            Control where Pax Logistics settles funds and which account remains primary for operations.
          </Typography>
        </Stack>
        {accounts && accounts.length > 0 && (
          <Button
            variant="contained"
            onClick={openAddDialog}
            sx={{
              borderRadius: 0,
              textTransform: 'none',
              fontWeight: 700,
              backgroundColor: '#16181D',
              color: '#FFFFFF',
              '&:hover': { backgroundColor: '#111827' },
            }}
          >
            + Add Account
          </Button>
        )}
      </Box>

      {/* 👉 Loading skeletons */}
      {isLoading ? (
        <Grid container spacing={3}>
          {Array.from({ length: 2 }).map((_, i) => (
            <Grid size={{ md: 6, xs: 12 }} key={i}>
              <Skeleton
                variant="rectangular"
                animation="wave"
                height={190}
                sx={{
                  borderRadius: 0,
                  bgcolor: '#F8FAFC',
                  '&::after': {
                    background: 'linear-gradient(90deg, transparent, rgba(217, 4, 22, 0.08), transparent)',
                  },
                }}
              />
            </Grid>
          ))}
        </Grid>
      ) : accounts?.length ? (
        <BankAccountsList
          onMakePrimary={handleMakePrimary}
          accounts={accounts}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      ) : (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            flexDirection: 'column',
            py: 8,
            px: 4,
            gap: 3,
            bgcolor: '#FAF6F3',
            borderRadius: 0,
            border: '1px solid rgba(217, 4, 22, 0.12)',
          }}
        >
          <Box
            sx={{
              width: 96,
              height: 96,
              borderRadius: 0,
              background: '#16181D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'none',
            }}
          >
            <MdOutlineAccountBalance size={48} color="#FFFFFF" />
          </Box>
          <Stack spacing={1} alignItems="center" textAlign="center">
            <Typography
              variant="h6"
              fontWeight={700}
              sx={{
                color: '#111827',
                fontSize: { xs: '1.125rem', md: '1.25rem' },
              }}
            >
              No Bank Accounts
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: '#6b6b6b', maxWidth: 400, fontSize: '0.9rem' }}
            >
              Add your bank account to receive payments and settlements securely
            </Typography>
          </Stack>
          <Button
            variant="contained"
            onClick={openAddDialog}
            sx={{
              px: 4,
              py: 1.5,
              borderRadius: 0,
              fontWeight: 600,
              backgroundColor: '#16181D',
              boxShadow: 'none',
              textTransform: 'none',
              color: '#FFFFFF',
              '&:hover': {
                backgroundColor: '#111827',
              },
            }}
          >
            + Add Bank Account
          </Button>
        </Box>
      )}

      <AddBankAccountDialog
        addingAccount={addBank.isPending || editBank.isPending}
        open={open}
        onClose={closeDialog}
        initialData={editing ?? undefined}
        onAdd={handleAdd}
      />
    </Stack>
  )
}
