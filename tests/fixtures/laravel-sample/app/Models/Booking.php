<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
class Booking extends Model
{
    use SoftDeletes;
    protected $table = 'bookings';
    public function company()
    {
        return $this->belongsTo(Company::class);
    }
    public function scopeUpcoming($q) { return $q; }
}
