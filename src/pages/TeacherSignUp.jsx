import { useState } from 'react';
import { supabase } from '../lib/supabase'; 
import { Mail, Lock, UserCircle } from 'lucide-react';

export default function TeacherSignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
      });

      if (authError) throw authError;

      if (authData?.user) {
        const { error: profileError } = await supabase
          .from('teachers')
          .insert([
            { 
              id: authData.user.id, 
              email: email,
              name: email.split('@')[0] 
            }
          ]);

        if (profileError) throw profileError;
        
        setMessage("Teacher account successfully created!");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <UserCircle size={48} className="mx-auto text-blue-800 mb-2" />
          <h1 className="text-2xl font-bold text-gray-900">Teacher Portal</h1>
          <p className="text-sm text-gray-500">Create an account</p>
        </div>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>}
        {message && <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm mb-4">{message}</div>}

        <form onSubmit={handleSignUp} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                className="w-full border rounded-lg pl-10 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="teacher@school.com" 
                required 
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                className="w-full border rounded-lg pl-10 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="Minimum 6 characters" 
                required 
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || password.length < 6} 
            className="w-full bg-blue-800 text-white py-2 rounded-lg font-medium hover:bg-blue-900 transition disabled:opacity-50"
          >
            {loading ? 'Creating account...' : "Sign Up"}
          </button>
        </form>
      </div>
    </div>
  );
}