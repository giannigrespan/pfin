import { createHousehold } from '@/app/actions/household'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function OnboardingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🏠</div>
          <h1 className="text-2xl font-bold">Benvenuto su PFin!</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Crea il tuo nucleo domestico e invita il tuo partner.
          </p>
        </div>
        <form action={createHousehold} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome nucleo domestico</Label>
            <Input id="name" name="name" placeholder="Casa Rossi" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="partnerEmail">Email del partner</Label>
            <Input
              id="partnerEmail"
              name="partnerEmail"
              type="email"
              placeholder="partner@email.com"
              required
              className="mt-1"
            />
          </div>
          <Button type="submit" className="w-full mt-2">
            Crea e invia invito 🚀
          </Button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-4">
          Il partner riceverà un&apos;email con il link per accedere.
        </p>
      </div>
    </div>
  )
}
