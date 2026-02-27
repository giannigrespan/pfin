import { acceptInvite } from '@/app/actions/household'
import { Button } from '@/components/ui/button'

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const accept = acceptInvite.bind(null, token)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold mb-2">Invito ricevuto!</h1>
        <p className="text-gray-500 mb-6 text-sm">
          Sei stato invitato a gestire le spese insieme su PFin.
          Accedi con Google per accettare.
        </p>
        <form action={accept}>
          <Button type="submit" className="w-full">
            Accetta invito e accedi
          </Button>
        </form>
      </div>
    </div>
  )
}
